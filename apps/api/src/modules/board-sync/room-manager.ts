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
}

export class RoomManager {
  private readonly logger = new Logger(RoomManager.name);
  private readonly rooms = new Map<string, RoomEntry>();
  private readonly loading = new Map<string, Promise<Room>>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly flushDelayMs: number;

  constructor(
    private readonly snapshots: SnapshotService,
    opts: RoomManagerOptions = {},
  ) {
    this.flushDelayMs = opts.flushDelayMs ?? 3000;
  }

  getOrCreate(boardId: string): Promise<Room> {
    const existing = this.rooms.get(boardId);
    if (existing) return Promise.resolve(existing.room);
    // Callers racing on a cold board must share one load; otherwise each builds
    // its own doc and the last `rooms.set` orphans updates applied to the others.
    const pending = this.loading.get(boardId);
    if (pending) return pending;
    const load = this.load(boardId).finally(() => this.loading.delete(boardId));
    this.loading.set(boardId, load);
    return load;
  }

  /**
   * Get (or load) the room and count the caller as a client in the same tick.
   * Counting after a separate `await` would leave a window in which the last
   * leaver's disposeIfIdle drops the room the joiner is about to use.
   */
  async acquire(boardId: string): Promise<Room> {
    const room = await this.getOrCreate(boardId);
    if (this.rooms.get(boardId)?.room !== room) return this.acquire(boardId);
    room.addClient();
    return room;
  }

  /** The live (or loading) room, without creating one for a board nobody here has open. */
  getIfActive(boardId: string): Promise<Room> | null {
    const existing = this.rooms.get(boardId);
    if (existing) return Promise.resolve(existing.room);
    return this.loading.get(boardId) ?? null;
  }

  private async load(boardId: string): Promise<Room> {
    const ydoc = new Y.Doc();
    const seed = await this.snapshots.loadLatest(boardId);
    if (seed) Y.applyUpdate(ydoc, seed);

    let clients = 0;
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
        return clients;
      },
      clients: (): number => clients,
    };
    const entry: RoomEntry = { room, revision: 0, savedRevision: 0 };
    // Yjs only emits 'update' when a transaction actually changed the doc, so a
    // redundant update (e.g. a reconnecting client's full state) stays clean.
    ydoc.on('update', () => {
      entry.revision += 1;
      this.scheduleFlush(boardId);
    });
    this.rooms.set(boardId, entry);
    return room;
  }

  private scheduleFlush(boardId: string): void {
    // flushDelayMs <= 0 means the caller (tests) flushes explicitly via flushNow
    if (this.flushDelayMs <= 0) return;
    const prior = this.timers.get(boardId);
    if (prior) clearTimeout(prior);
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
      }, this.flushDelayMs),
    );
  }

  async flushNow(boardId: string): Promise<void> {
    const entry = this.rooms.get(boardId);
    if (!entry) return;
    const prior = this.timers.get(boardId);
    if (prior) clearTimeout(prior);
    this.timers.delete(boardId);
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
    this.rooms.get(boardId)?.room.ydoc.destroy();
    this.rooms.delete(boardId);
  }
}
