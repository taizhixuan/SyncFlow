import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { io } from 'socket.io-client';
import {
  SYNC_EVENTS,
  clockAckSchema,
  roleChangeSchema,
  syncErrorSchema,
  type BoardRole,
  type SyncErrorPayload,
} from '@syncflow/shared';
import { REMOTE_ORIGIN } from '@/features/canvas/engine/yjs-doc';

/** socket.io's function form of `auth`: evaluated on every (re)connect handshake. */
export type SocketAuth = (cb: (data: { token: string }) => void) => void;

export interface SocketLike {
  connected: boolean;
  on(ev: string, cb: (arg: never) => void): SocketLike;
  /** A trailing function argument is a socket.io acknowledgement callback. */
  emit(ev: string, ...args: unknown[]): SocketLike;
  connect(): SocketLike;
  disconnect(): SocketLike;
}

type Status = 'offline' | 'connecting' | 'live';

/** Why the server refused us for good. The provider stops reconnecting. */
/** Server errors that end the session for this board (no automatic reconnect). */
export type SyncRejection = Exclude<SyncErrorPayload['code'], 'rate-limited'>;

/** Consecutive `unauthorized` rejections tolerated (each after a refresh) before giving up. */
const MAX_AUTH_RETRIES = 2;
const SERVER_KICK_BASE_DELAY_MS = 1000;
const SERVER_KICK_MAX_DELAY_MS = 5000;
/** Clock pings per connection; the one with the tightest round trip wins. */
const CLOCK_SAMPLES = 3;
/** A clock ack slower than this says more about the network than the clock. */
const CLOCK_ACK_TIMEOUT_MS = 3000;

export interface BoardSyncOptions {
  url: string;
  boardId: string;
  /**
   * The current access token, read on every (re)connect so a reconnect after a
   * silent refresh never presents a stale, expired token.
   */
  getToken: () => string | null;
  /**
   * Obtain a fresh access token after the server rejected ours. Resolves the
   * new token, or null when the session is gone. Omitted: unauthorized is terminal.
   */
  refreshToken?: () => Promise<string | null>;
  /** The server refused us for good (not a member, board gone, session gone). */
  onRejected?: (reason: SyncRejection) => void;
  /** Our role on the board changed while connected (promoted or demoted). */
  onRoleChanged?: (role: BoardRole) => void;
  /**
   * Server clock minus local clock, measured after every (re)connect. Shared
   * timers run on server time so peers with wrong clocks still agree.
   */
  onClockOffset?: (offsetMs: number) => void;
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
  socketFactory?: (url: string, auth: SocketAuth) => SocketLike;
}

export class BoardSyncProvider {
  private socket: SocketLike | null = null;
  private readonly onDocUpdate: (update: Uint8Array, origin: unknown) => void;
  private readonly onAwareness: (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void;
  private destroyed = false;
  private rejected: SyncRejection | null = null;
  /** An `unauthorized` rejection is being handled (refresh → reconnect). */
  private reauthenticating = false;
  private authRetries = 0;
  private serverKicks = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped per measurement so acks from a superseded one are ignored. */
  private clockRun = 0;
  private clockTimer: ReturnType<typeof setTimeout> | null = null;

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

  // socket.io only notices a dead network when a heartbeat goes missing — with
  // the default 25s ping interval + 20s timeout that can take ~45s; the browser
  // knows at once, so follow it for the status badge and the reconnect.
  private readonly onBrowserOffline = (): void => {
    if (this.destroyed || this.rejected) return;
    this.opts.onStatus('offline');
  };

  private readonly onBrowserOnline = (): void => {
    if (this.destroyed || this.rejected || this.reauthenticating) return;
    const socket = this.socket;
    if (!socket || socket.connected) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.opts.onStatus('connecting');
    socket.connect();
  };

  connect(): void {
    this.opts.onStatus('connecting');
    if (typeof window !== 'undefined') {
      window.addEventListener('offline', this.onBrowserOffline);
      window.addEventListener('online', this.onBrowserOnline);
    }
    // Function-form auth: socket.io calls it on every handshake, including its
    // own automatic reconnects, so the token is always the latest one.
    const auth: SocketAuth = (cb) => cb({ token: this.opts.getToken() ?? '' });
    const factory =
      this.opts.socketFactory ??
      ((url, authFn) =>
        io(url, {
          auth: authFn,
          query: { boardId: this.opts.boardId },
          // Document intent: socket.io defaults to reconnection: true but we make it explicit
          // so offline edits queued in ydoc merge on reconnect via the 'connect' handler below.
          reconnection: true,
          reconnectionDelayMax: 5000,
        }) as unknown as SocketLike);
    const socket = factory(this.opts.url, auth);
    this.socket = socket;

    socket.on('connect', () => {
      // room join is performed server-side from the authorized handshake (no board:join message)
      // hand the server our state so offline edits merge
      socket.emit(SYNC_EVENTS.clientSync, Y.encodeStateAsUpdate(this.opts.ydoc));
      // Re-stamp our identity, then push our full Awareness (user/cursor/selection)
      // so peers already in the room render us immediately — the relay keeps no
      // awareness state of its own, and a prior teardown may have cleared ours.
      if (this.opts.awareness && this.opts.user) {
        // setLocalStateField is a no-op when local state is null (left so by a
        // prior teardown); re-arm first so identity actually publishes.
        if (this.opts.awareness.getLocalState() === null) this.opts.awareness.setLocalState({});
        this.opts.awareness.setLocalStateField('user', this.opts.user);
      }
      this.emitFullAwareness();
      this.measureClock(socket);
      this.opts.onStatus('live');
    });
    socket.on(SYNC_EVENTS.serverSync, (update: never) => {
      // The server only syncs an admitted socket: the handshake fully succeeded.
      this.authRetries = 0;
      this.serverKicks = 0;
      this.opts.applyRemote(new Uint8Array(update as ArrayBuffer));
      this.opts.onStatus('live');
    });
    socket.on(SYNC_EVENTS.update, (update: never) => {
      this.opts.applyRemote(new Uint8Array(update as ArrayBuffer));
    });
    socket.on('disconnect', (reason: never) => this.handleDisconnect(reason as string));
    socket.on(SYNC_EVENTS.error, (payload: never) => this.handleServerError(payload as unknown));
    socket.on(SYNC_EVENTS.role, (payload: unknown) => {
      const parsed = roleChangeSchema.safeParse(payload);
      if (parsed.success) this.opts.onRoleChanged?.(parsed.data.role);
      else console.warn('[sync] dropped malformed role change', payload);
    });
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

  /**
   * The server emits `board:error {code}` and then force-disconnects. socket.io
   * never auto-reconnects after a server-initiated disconnect, so each code
   * needs an explicit decision here rather than an endless "reconnecting…".
   */
  private handleServerError(payload: unknown): void {
    const parsed = syncErrorSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn('[sync] dropped malformed board:error payload', payload);
      return;
    }
    const { code, message } = parsed.data;
    if (code === 'rate-limited') {
      // The server cut us off for flooding it; come back, but at the slowest
      // retry pace so a stuck loop can't hammer it again straight away. The
      // 'io server disconnect' that follows schedules the reconnect.
      console.warn(`[sync] rate-limited on board ${this.opts.boardId}: ${message}`);
      this.serverKicks = Math.max(this.serverKicks, SERVER_KICK_MAX_DELAY_MS / SERVER_KICK_BASE_DELAY_MS - 1);
      return;
    }
    if (code !== 'unauthorized') {
      this.reject(code, message);
      return;
    }
    const refreshToken = this.opts.refreshToken;
    if (!refreshToken || this.authRetries >= MAX_AUTH_RETRIES) {
      this.reject(code, message);
      return;
    }
    this.authRetries += 1;
    this.reauthenticating = true;
    this.opts.onStatus('connecting');
    refreshToken().then(
      (token) => {
        this.reauthenticating = false;
        if (this.destroyed || this.rejected) return;
        if (!token) {
          this.reject('unauthorized', 'Session expired');
          return;
        }
        this.socket?.connect();
      },
      (err: unknown) => {
        // Network trouble refreshing says nothing about the session: try again
        // shortly; the retry cap still bounds this.
        this.reauthenticating = false;
        console.warn('[sync] token refresh failed; retrying the connection', err);
        this.scheduleReconnect();
      },
    );
  }

  private handleDisconnect(reason: string): void {
    if (this.destroyed || this.rejected) {
      this.opts.onStatus('offline');
      return;
    }
    if (this.reauthenticating) {
      this.opts.onStatus('connecting');
      return;
    }
    if (reason === 'io client disconnect') {
      this.opts.onStatus('offline');
      return;
    }
    this.opts.onStatus('connecting');
    // Kicked by the server without a rejection (e.g. a restart draining sockets):
    // socket.io will not come back on its own.
    if (reason === 'io server disconnect') this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.rejected || this.reconnectTimer) return;
    this.serverKicks += 1;
    const delay = Math.min(SERVER_KICK_BASE_DELAY_MS * this.serverKicks, SERVER_KICK_MAX_DELAY_MS);
    this.opts.onStatus('connecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed && !this.rejected) this.socket?.connect();
    }, delay);
  }

  private reject(code: SyncRejection, message: string): void {
    if (this.rejected) return;
    this.rejected = code;
    console.warn(`[sync] server rejected board ${this.opts.boardId}: ${code} (${message})`);
    this.opts.onStatus('offline');
    this.opts.onRejected?.(code);
  }

  /**
   * Estimate the server clock offset with sequential pings (a burst would queue
   * behind itself and inflate the round trips). Assuming a symmetric path, the
   * server read its clock halfway through the round trip, so the tightest
   * round trip bounds the error best.
   */
  private measureClock(socket: SocketLike): void {
    if (!this.opts.onClockOffset) return;
    const run = ++this.clockRun;
    this.clearClockTimer();
    const samples: Array<{ rttMs: number; offsetMs: number }> = [];
    const isCurrent = (): boolean => !this.destroyed && run === this.clockRun;

    const finish = (): void => {
      const best = samples.reduce<(typeof samples)[number] | null>(
        (min, s) => (min === null || s.rttMs < min.rttMs ? s : min),
        null,
      );
      if (best) this.opts.onClockOffset?.(best.offsetMs);
    };

    const ping = (left: number): void => {
      if (!isCurrent()) return;
      if (left === 0) {
        finish();
        return;
      }
      const t0 = Date.now();
      let settled = false;
      const next = (): void => {
        settled = true;
        this.clearClockTimer();
        ping(left - 1);
      };
      this.clockTimer = setTimeout(() => {
        if (settled || !isCurrent()) return;
        console.warn('[sync] clock ping timed out');
        next();
      }, CLOCK_ACK_TIMEOUT_MS);
      socket.emit(SYNC_EVENTS.clock, (ack: unknown) => {
        if (settled || !isCurrent()) return;
        const t1 = Date.now();
        const parsed = clockAckSchema.safeParse(ack);
        if (parsed.success) {
          samples.push({ rttMs: t1 - t0, offsetMs: parsed.data.serverNow - (t0 + t1) / 2 });
        } else {
          console.warn('[sync] dropped malformed board:clock ack', ack);
        }
        next();
      });
    };
    ping(CLOCK_SAMPLES);
  }

  private clearClockTimer(): void {
    if (this.clockTimer) {
      clearTimeout(this.clockTimer);
      this.clockTimer = null;
    }
  }

  /** Emit our complete local Awareness state (user, cursor, selection, …) to the room. */
  private emitFullAwareness(): void {
    const awareness = this.opts.awareness;
    if (!awareness) return;
    this.socket?.emit(SYNC_EVENTS.awareness, encodeAwarenessUpdate(awareness, [awareness.clientID]));
  }

  destroy(): void {
    this.destroyed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener('offline', this.onBrowserOffline);
      window.removeEventListener('online', this.onBrowserOnline);
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearClockTimer();
    // We are no longer connected — report it so the UI can't show a stale "live"
    // badge after teardown (e.g. when the token is lost and we don't reconnect).
    this.opts.onStatus('offline');
    this.opts.ydoc.off('update', this.onDocUpdate);
    if (this.opts.awareness) {
      // Remove our state while still subscribed and connected, so the removal is
      // actually broadcast; unsubscribing first left peers with a ghost cursor.
      removeAwarenessStates(this.opts.awareness, [this.opts.awareness.clientID], 'local');
      this.opts.awareness.off('update', this.onAwareness);
    }
    this.socket?.disconnect();
    this.socket = null;
  }
}
