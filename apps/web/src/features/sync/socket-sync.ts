import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { io } from 'socket.io-client';
import { SYNC_EVENTS } from '@syncflow/shared';
import { REMOTE_ORIGIN } from '@/features/canvas/engine/yjs-doc';

export interface SocketLike {
  connected: boolean;
  on(ev: string, cb: (arg: never) => void): SocketLike;
  emit(ev: string, arg?: unknown): SocketLike;
  disconnect(): SocketLike;
}

type Status = 'offline' | 'connecting' | 'live';

export interface BoardSyncOptions {
  url: string;
  boardId: string;
  token: string;
  ydoc: Y.Doc;
  awareness?: Awareness;
  applyRemote(update: Uint8Array): void;
  onStatus(status: Status): void;
  socketFactory?: (url: string, token: string) => SocketLike;
}

export class BoardSyncProvider {
  private socket: SocketLike | null = null;
  private readonly onDocUpdate: (update: Uint8Array, origin: unknown) => void;
  private readonly onAwareness: (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void;

  constructor(private readonly opts: BoardSyncOptions) {
    this.onDocUpdate = (update, origin) => {
      if (origin === REMOTE_ORIGIN) return; // don't echo remote edits back
      this.socket?.emit(SYNC_EVENTS.update, update);
    };
    this.onAwareness = ({ added, updated, removed }, origin) => {
      if (origin === 'remote') return; // don't echo applied-remote awareness
      if (!this.opts.awareness) return;
      const changed = [...added, ...updated, ...removed];
      this.socket?.emit(SYNC_EVENTS.awareness, encodeAwarenessUpdate(this.opts.awareness, changed));
    };
  }

  connect(): void {
    this.opts.onStatus('connecting');
    const factory =
      this.opts.socketFactory ??
      ((url, token) =>
        io(url, { auth: { token }, query: { boardId: this.opts.boardId } }) as unknown as SocketLike);
    const socket = factory(this.opts.url, this.opts.token);
    this.socket = socket;

    socket.on('connect', () => {
      // room join is performed server-side from the authorized handshake (no board:join message)
      // hand the server our state so offline edits merge
      socket.emit(SYNC_EVENTS.clientSync, Y.encodeStateAsUpdate(this.opts.ydoc));
      this.opts.onStatus('live');
    });
    socket.on(SYNC_EVENTS.serverSync, (update: never) => {
      this.opts.applyRemote(new Uint8Array(update as ArrayBuffer));
      this.opts.onStatus('live');
    });
    socket.on(SYNC_EVENTS.update, (update: never) => {
      this.opts.applyRemote(new Uint8Array(update as ArrayBuffer));
    });
    socket.on('disconnect', () => this.opts.onStatus('connecting'));
    socket.on(SYNC_EVENTS.error, () => this.opts.onStatus('offline'));
    if (this.opts.awareness) {
      const awareness = this.opts.awareness;
      socket.on(SYNC_EVENTS.awareness, (bytes: never) => {
        applyAwarenessUpdate(awareness, new Uint8Array(bytes as ArrayBuffer), 'remote');
      });
      awareness.on('update', this.onAwareness);
    }

    this.opts.ydoc.on('update', this.onDocUpdate);
  }

  destroy(): void {
    this.opts.ydoc.off('update', this.onDocUpdate);
    if (this.opts.awareness) {
      this.opts.awareness.off('update', this.onAwareness);
      removeAwarenessStates(this.opts.awareness, [this.opts.awareness.clientID], 'local');
    }
    this.socket?.disconnect();
    this.socket = null;
  }
}
