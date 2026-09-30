import * as Y from 'yjs';
import type { SnapshotService } from './snapshot.service';

export interface Room {
  boardId: string;
  ydoc: Y.Doc;
  applyUpdate(update: Uint8Array): void;
  encodeState(): Uint8Array;
  addClient(): void;
  removeClient(): number;
}

interface RoomManagerOptions {
  flushDelayMs?: number;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
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
    if (existing) return Promise.resolve(existing);
    // Callers racing on a cold board must share one load; otherwise each builds
    // its own doc and the last `rooms.set` orphans updates applied to the others.
    const pending = this.loading.get(boardId);
    if (pending) return pending;
    const load = this.load(boardId).finally(() => this.loading.delete(boardId));
    this.loading.set(boardId, load);
    return load;
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
        this.scheduleFlush(boardId);
      },
      encodeState: (): Uint8Array => Y.encodeStateAsUpdate(ydoc),
      addClient: (): void => {
        clients += 1;
      },
      removeClient: (): number => {
        clients = Math.max(0, clients - 1);
        return clients;
      },
    };
    this.rooms.set(boardId, room);
    return room;
  }

  private scheduleFlush(boardId: string): void {
    // flushDelayMs <= 0 means the caller (tests) flushes explicitly via flushNow
    if (this.flushDelayMs <= 0) return;
    const prior = this.timers.get(boardId);
    if (prior) clearTimeout(prior);
    this.timers.set(
      boardId,
      setTimeout(() => void this.flushNow(boardId), this.flushDelayMs),
    );
  }

  async flushNow(boardId: string): Promise<void> {
    const room = this.rooms.get(boardId);
    if (!room) return;
    const prior = this.timers.get(boardId);
    if (prior) clearTimeout(prior);
    this.timers.delete(boardId);
    await this.snapshots.save(boardId, room.encodeState(), undefined);
  }

  dispose(boardId: string): void {
    const prior = this.timers.get(boardId);
    if (prior) clearTimeout(prior);
    this.timers.delete(boardId);
    this.rooms.delete(boardId);
  }
}
