import * as Y from 'yjs';
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
  applyRemote(update: Uint8Array): void;
  onStatus(status: Status): void;
  socketFactory?: (url: string, token: string) => SocketLike;
}

export class BoardSyncProvider {
  private socket: SocketLike | null = null;
  private readonly onDocUpdate: (update: Uint8Array, origin: unknown) => void;

  constructor(private readonly opts: BoardSyncOptions) {
    this.onDocUpdate = (update, origin) => {
      if (origin === REMOTE_ORIGIN) return; // don't echo remote edits back
      this.socket?.emit(SYNC_EVENTS.update, update);
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

    this.opts.ydoc.on('update', this.onDocUpdate);
  }

  destroy(): void {
    this.opts.ydoc.off('update', this.onDocUpdate);
    this.socket?.disconnect();
    this.socket = null;
  }
}
