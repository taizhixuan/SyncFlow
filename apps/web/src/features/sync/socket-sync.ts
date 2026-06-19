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
  /**
   * The local user's presence identity. Re-stamped onto Awareness on every
   * (re)connect so a provider teardown that cleared local state — or a connect
   * that happened before auth resolved — can never leave us identity-less and
   * thus invisible to peers (their snapshot drops states without a `user`).
   */
  user?: { id: string; name: string; color: string };
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
        io(url, {
          auth: { token },
          query: { boardId: this.opts.boardId },
          // Document intent: socket.io defaults to reconnection: true but we make it explicit
          // so offline edits queued in ydoc merge on reconnect via the 'connect' handler below.
          reconnection: true,
          reconnectionDelayMax: 5000,
        }) as unknown as SocketLike);
    const socket = factory(this.opts.url, this.opts.token);
    this.socket = socket;

    socket.on('connect', () => {
      // room join is performed server-side from the authorized handshake (no board:join message)
      // hand the server our state so offline edits merge
      socket.emit(SYNC_EVENTS.clientSync, Y.encodeStateAsUpdate(this.opts.ydoc));
      // Re-stamp our identity, then push our full Awareness (user/cursor/selection)
      // so peers already in the room render us immediately — the relay keeps no
      // awareness state of its own, and a prior teardown may have cleared ours.
      if (this.opts.awareness && this.opts.user) {
        this.opts.awareness.setLocalStateField('user', this.opts.user);
      }
      this.emitFullAwareness();
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
      // A new peer joined and the relay holds no awareness state — re-broadcast
      // ours so they can render our cursor/name without waiting for us to move.
      socket.on(SYNC_EVENTS.awarenessRequest, () => this.emitFullAwareness());
      awareness.on('update', this.onAwareness);
    }

    this.opts.ydoc.on('update', this.onDocUpdate);
  }

  /** Emit our complete local Awareness state (user, cursor, selection, …) to the room. */
  private emitFullAwareness(): void {
    const awareness = this.opts.awareness;
    if (!awareness) return;
    this.socket?.emit(SYNC_EVENTS.awareness, encodeAwarenessUpdate(awareness, [awareness.clientID]));
  }

  destroy(): void {
    // We are no longer connected — report it so the UI can't show a stale "live"
    // badge after teardown (e.g. when the token is lost and we don't reconnect).
    this.opts.onStatus('offline');
    this.opts.ydoc.off('update', this.onDocUpdate);
    if (this.opts.awareness) {
      this.opts.awareness.off('update', this.onAwareness);
      removeAwarenessStates(this.opts.awareness, [this.opts.awareness.clientID], 'local');
    }
    this.socket?.disconnect();
    this.socket = null;
  }
}
