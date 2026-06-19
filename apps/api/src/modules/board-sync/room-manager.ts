import * as Y from 'yjs';
import type { SnapshotService } from './snapshot.service';

export interface Room {
  boardId: string;
  ydoc: Y.Doc;
  clients: number;
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
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly flushDelayMs: number;

  constructor(
    private readonly snapshots: SnapshotService,
    opts: RoomManagerOptions = {},
  ) {
    this.flushDelayMs = opts.flushDelayMs ?? 3000;
  }

  async getOrCreate(boardId: string): Promise<Room> {
    const existing = this.rooms.get(boardId);
    if (existing) return existing;

    const ydoc = new Y.Doc();
    const seed = await this.snapshots.loadLatest(boardId);
    if (seed) Y.applyUpdate(ydoc, seed);

    const room: Room = {
      boardId,
      ydoc,
      clients: 0,
      applyUpdate: (update: Uint8Array): void => {
        Y.applyUpdate(ydoc, update);
        this.scheduleFlush(boardId);
      },
      encodeState: (): Uint8Array => Y.encodeStateAsUpdate(ydoc),
      addClient: (): void => {
        room.clients += 1;
      },
      removeClient: (): number => {
        room.clients = Math.max(0, room.clients - 1);
        return room.clients;
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
