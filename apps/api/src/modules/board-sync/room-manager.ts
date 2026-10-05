import { Logger } from '@nestjs/common';
import * as Y from 'yjs';
import type { SnapshotService } from './snapshot.service';

export interface Room {
  boardId: string;
  ydoc: Y.Doc;
  applyUpdate(update: Uint8Array): void;
  encodeState(): Uint8Array;
  addClient(): void;
  removeClient(): number;
  clients(): number;
}

/**
 * Merges what other instances hold into a room before anyone here uses it.
 * A rejection is logged and the room opens anyway.
 */
export type RoomSeeder = (room: Room) => Promise<void>;

/**
 * Longest a dirty room waits for its save. The debounce restarts on every
 * edit, so a board under steady editing would otherwise never be persisted,
 * and a crash would lose everything since its last quiet moment.
 */
export const MAX_FLUSH_WAIT_MS = 30_000;

interface RoomManagerOptions {
  flushDelayMs?: number;
}

interface RoomEntry {
  room: Room;
  // Bumped on every doc change (including direct ydoc mutations such as a
  // restore reconcile). A state-vector comparison would miss delete-only
  // changes, which add to the delete set without advancing any clock.
  revision: number;
  savedRevision: number;
  /**
   * The last local client left but the room was kept (its save failed). The
   * board's Redis subscription lapsed with that client, so the room may have
   * missed other instances' edits and must be re-seeded before it is reused.
   */
  detached: boolean;
  /** Settles once the room's latest seeding finished; joiners wait for it. */
  ready: Promise<void>;
}

export class RoomManager {
  private readonly logger = new Logger(RoomManager.name);
  private readonly rooms = new Map<string, RoomEntry>();
  private readonly loading = new Map<string, Promise<Room>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** When each room's oldest unsaved edit was scheduled (the max-wait clock). */
  private readonly dirtySince = new Map<string, number>();
  private readonly flushDelayMs: number;

  constructor(
    private readonly snapshots: SnapshotService,
    opts: RoomManagerOptions = {},
  ) {
    this.flushDelayMs = opts.flushDelayMs ?? 3000;
  }

  /**
   * The board's room, loading it on first use. `seed` runs once per fresh load,
   * and again when a kept, detached room is reused; every caller waits for it.
   */
  getOrCreate(boardId: string, seed?: RoomSeeder): Promise<Room> {
    const existing = this.rooms.get(boardId);
    if (existing) {
      if (existing.detached && seed) {
        existing.detached = false;
        existing.ready = this.runSeed(boardId, existing.room, seed);
      }
      return existing.ready.then(() => existing.room);
    }
    // Callers racing on a cold board must share one load; otherwise each builds
    // its own doc and the last `rooms.set` orphans updates applied to the others.
    const pending = this.loading.get(boardId);
    if (pending) return pending;
    const load = this.load(boardId, seed).finally(() => this.loading.delete(boardId));
    this.loading.set(boardId, load);
    return load;
  }

  /**
   * Get (or load) the room and count the caller as a client in the same tick.
   * Counting after a separate `await` would leave a window in which the last
   * leaver's disposeIfIdle drops the room the joiner is about to use.
   */
  async acquire(boardId: string, seed?: RoomSeeder): Promise<Room> {
    const room = await this.getOrCreate(boardId, seed);
    if (this.rooms.get(boardId)?.room !== room) return this.acquire(boardId, seed);
    room.addClient();
    return room;
  }

  /** The live (or loading) room, without creating one for a board nobody here has open. */
  getIfActive(boardId: string): Promise<Room> | null {
    const existing = this.rooms.get(boardId);
    if (existing) return Promise.resolve(existing.room);
    return this.loading.get(boardId) ?? null;
  }

  /** The room only once it is fully loaded; one still loading holds nothing beyond the snapshot. */
  getIfLoaded(boardId: string): Room | null {
    return this.rooms.get(boardId)?.room ?? null;
  }

  private async runSeed(boardId: string, room: Room, seed: RoomSeeder): Promise<void> {
    try {
      await seed(room);
    } catch (err) {
      this.logger.warn(`seeding the room for board ${boardId} from other instances failed: ${String(err)}`);
    }
  }

  private async load(boardId: string, seed?: RoomSeeder): Promise<Room> {
    const ydoc = new Y.Doc();
    const snapshot = await this.snapshots.loadLatest(boardId);
    if (snapshot) Y.applyUpdate(ydoc, snapshot);

    let clients = 0;
    let entry: RoomEntry | null = null;
    const room: Room = {
      boardId,
      ydoc,
      applyUpdate: (update: Uint8Array): void => {
        Y.applyUpdate(ydoc, update);
      },
      encodeState: (): Uint8Array => Y.encodeStateAsUpdate(ydoc),
      addClient: (): void => {
        clients += 1;
      },
      removeClient: (): number => {
        clients = Math.max(0, clients - 1);
        if (clients === 0 && entry) entry.detached = true;
        return clients;
      },
      clients: (): number => clients,
    };
    // Other instances' unsaved edits, merged before the room is published and
    // before the change listener: saving them is their instance's job.
    if (seed) await this.runSeed(boardId, room, seed);
    const loaded: RoomEntry = { room, revision: 0, savedRevision: 0, detached: false, ready: Promise.resolve() };
    entry = loaded;
    // Yjs only emits 'update' when a transaction actually changed the doc, so a
    // redundant update (e.g. a reconnecting client's full state) stays clean.
    ydoc.on('update', () => {
      loaded.revision += 1;
      this.scheduleFlush(boardId);
    });
    this.rooms.set(boardId, loaded);
    return room;
  }

  private scheduleFlush(boardId: string): void {
    // flushDelayMs <= 0 means the caller (tests) flushes explicitly via flushNow
    if (this.flushDelayMs <= 0) return;
    const prior = this.timers.get(boardId);
    if (prior) clearTimeout(prior);
    const now = Date.now();
    const since = this.dirtySince.get(boardId) ?? now;
    this.dirtySince.set(boardId, since);
    const delay = Math.max(0, Math.min(this.flushDelayMs, since + MAX_FLUSH_WAIT_MS - now));
    this.timers.set(
      boardId,
      setTimeout(() => {
        this.timers.delete(boardId);
        // A rejection here has no awaiting caller; left unhandled it would take
        // the whole process (and every other board's room) down.
        this.flushNow(boardId)
          .then(() => {
            this.disposeIfIdle(boardId);
          })
          .catch((err: unknown) => {
            this.logger.warn(`debounced snapshot save failed for board ${boardId}: ${String(err)}`);
            if (this.rooms.has(boardId)) this.scheduleFlush(boardId);
          });
      }, delay),
    );
  }

  async flushNow(boardId: string): Promise<void> {
    const entry = this.rooms.get(boardId);
    if (!entry) return;
    const prior = this.timers.get(boardId);
    if (prior) clearTimeout(prior);
    this.timers.delete(boardId);
    // Edits landing from here on start a new max-wait window.
    this.dirtySince.delete(boardId);
    if (entry.revision === entry.savedRevision) return;
    // Capture the revision the encoded state reflects: an edit landing while the
    // save is in flight must leave the room dirty for the next flush.
    const revision = entry.revision;
    await this.snapshots.save(boardId, entry.room.encodeState(), undefined);
    entry.savedRevision = Math.max(entry.savedRevision, revision);
  }

  /**
   * The last local client left: persist, then drop the room unless someone
   * rejoined while the save was in flight. A failed save keeps the room (and
   * retries on the debounce timer) rather than discarding unsaved edits.
   */
  async releaseIdle(boardId: string): Promise<void> {
    try {
      await this.flushNow(boardId);
    } catch (err) {
      this.logger.warn(`snapshot flush on last leave failed for board ${boardId}: ${String(err)}`);
      this.scheduleFlush(boardId);
      return;
    }
    this.disposeIfIdle(boardId);
  }

  /** Persist every dirty room (graceful shutdown). Failures are logged, not thrown. */
  async flushAll(): Promise<void> {
    const boardIds = Array.from(this.rooms.keys());
    const results = await Promise.allSettled(boardIds.map((id) => this.flushNow(id)));
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger.error(`shutdown snapshot save failed for board ${boardIds[i]}: ${String(result.reason)}`);
      }
    });
  }

  /**
   * Drop a room nobody on this instance is using. Once the last client leaves,
   * the bridge unsubscribes from the board's Redis channel, so a kept room would
   * silently go stale; the next joiner must reload the latest snapshot instead.
   * Returns false (and keeps the room) if a client rejoined or a save is pending.
   */
  disposeIfIdle(boardId: string): boolean {
    const entry = this.rooms.get(boardId);
    if (!entry || entry.room.clients() > 0 || this.timers.has(boardId)) return false;
    if (entry.revision !== entry.savedRevision) return false;
    this.dispose(boardId);
    return true;
  }

  dispose(boardId: string): void {
    const prior = this.timers.get(boardId);
    if (prior) clearTimeout(prior);
    this.timers.delete(boardId);
    this.dirtySince.delete(boardId);
    this.rooms.get(boardId)?.room.ydoc.destroy();
    this.rooms.delete(boardId);
  }
}
