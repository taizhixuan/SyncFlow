import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, UnprocessableEntityException } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import * as Y from 'yjs';
import { SYNC_EVENTS, type ClockAck, type SyncErrorPayload } from '@syncflow/shared';
import { TokenService, type AccessTokenClaims } from '../../auth/token.service';
import { BoardsService } from '../../boards/boards.service';
import { BoardAccessEvents, type BoardAccessChange } from '../../boards/board-access-events';
import { RoomManager } from './room-manager';
import { BoardSyncBridge, type ClaimMessage } from './board-sync-bridge';
import { SnapshotService } from './snapshot.service';
import { BoardLiveState } from './board-live-state';
import { reconcileToSnapshot } from './restore-reconcile';
import { decodeAwarenessEntries, encodeAwarenessRemoval, encodeAwarenessUpdate } from './awareness-codec';
import {
  AwarenessClaims,
  CLAIM_REFRESH_INTERVAL_MS,
  screenAwareness,
  screenRemoteAwareness,
  type AwarenessClaimant,
} from './awareness-guard';
import { SocketRateLimiter, type RateClass } from './socket-rate-limiter';

/**
 * Socket.io's 1 MB default is smaller than the full-state client-sync of a busy
 * board; an oversized frame makes the server drop the connection, the client
 * reconnects and resends the same frame, looping forever. 8 MB fits large
 * boards (images are uploaded to object storage, not embedded) while still
 * bounding how much memory a single message can claim.
 */
export const MAX_SOCKET_PAYLOAD_BYTES = 8 * 1024 * 1024;

// setTimeout clamps anything larger to 1 ms; tokens that far out are simply
// checked on each write instead of being scheduled.
const MAX_TIMER_MS = 2 ** 31 - 1;

type SyncErrorCode = SyncErrorPayload['code'];

/** A socket sending bad awareness usually sends a lot of it; one warning per window per socket. */
const AWARENESS_WARN_INTERVAL_MS = 5000;

interface SocketState extends AwarenessClaimant {
  // Mutable: membership changes re-read it so a demotion takes effect at once.
  role: 'owner' | 'editor' | 'viewer';
  /** Access-token expiry (epoch ms); null when the token carries no `exp`. */
  expiresAt: number | null;
  lastAwarenessWarnAt: number;
}

function toBytes(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  return null;
}

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: MAX_SOCKET_PAYLOAD_BYTES,
})
export class BoardSyncGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(BoardSyncGateway.name);
  // socket.id -> handshake outcome (null = rejected). Set synchronously on
  // connect so messages the client sends before auth finishes wait for it
  // instead of being dropped — the client emits client-sync on 'connect'.
  private readonly sessions = new Map<string, Promise<SocketState | null>>();
  private readonly expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // socket.id -> its message budgets; created on connect, dropped on disconnect.
  private readonly limiters = new Map<string, SocketRateLimiter>();
  private readonly claims = new AwarenessClaims();
  private unsubscribeAccess: (() => void) | null = null;
  private claimRefreshTimer: ReturnType<typeof setInterval> | null = null;
  @WebSocketServer() private server!: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly boards: BoardsService,
    private readonly rooms: RoomManager,
    private readonly bridge: BoardSyncBridge,
    private readonly snapshots: SnapshotService,
    private readonly access: BoardAccessEvents,
    private readonly liveState: BoardLiveState,
  ) {}

  afterInit(): void {
    // Apply updates from other instances to our in-memory room doc and fan them
    // out to our local clients for this board.
    this.bridge.setUpdateHandler((boardId, update) => {
      void this.applyRemote(boardId, update);
    });
    // Relay awareness (cursors/presence) from other instances to local clients.
    // Awareness is never applied to the room doc or persisted.
    this.bridge.setAwarenessHandler((boardId, update) => this.relayRemoteAwareness(boardId, update));
    // A client joined on another instance: our clients re-broadcast their
    // awareness so the newcomer sees idle cursors without waiting for a move.
    this.bridge.setAwarenessRequestHandler((boardId) => {
      this.server.to(boardId).emit(SYNC_EVENTS.awarenessRequest);
    });
    this.bridge.setAccessHandler((boardId, payload) => this.access.receive(boardId, payload));
    // Redis came back after an outage: everything published meanwhile is lost.
    this.bridge.setResyncHandler((boardIds) => {
      for (const boardId of boardIds) {
        // Claims (and releases) published during the outage were lost too:
        // re-announce ours and ask for everyone else's.
        this.announceClaims(boardId);
        this.bridge.publishClaims(boardId, { op: 'refresh' });
        void this.catchUp(boardId);
      }
    });
    this.bridge.setClaimHandler((boardId, instanceId, msg) => this.onRemoteClaim(boardId, instanceId, msg));
    // Remote claims lapse after REMOTE_CLAIM_TTL_MS unless re-announced, so a
    // crashed instance's claims (it never sends releases) do not live forever.
    if (this.claimRefreshTimer) clearInterval(this.claimRefreshTimer);
    this.claimRefreshTimer = setInterval(() => {
      this.claims.sweepRemote();
      for (const boardId of this.claims.localBoards()) this.announceClaims(boardId);
    }, CLAIM_REFRESH_INTERVAL_MS);
    this.claimRefreshTimer.unref?.();
    this.unsubscribeAccess?.();
    this.unsubscribeAccess = this.access.subscribe((change) => {
      void this.onAccessChange(change);
    });
  }

  /** Persist pending debounced edits before the process exits (SIGTERM on deploy). */
  async onModuleDestroy(): Promise<void> {
    this.unsubscribeAccess?.();
    this.unsubscribeAccess = null;
    if (this.claimRefreshTimer) clearInterval(this.claimRefreshTimer);
    this.claimRefreshTimer = null;
    for (const timer of this.expiryTimers.values()) clearTimeout(timer);
    this.expiryTimers.clear();
    await this.rooms.flushAll();
  }

  private async applyRemote(boardId: string, update: Uint8Array): Promise<void> {
    // Only boards with a live (or loading) room here; a late message after the
    // last local client left must not resurrect a room nobody will flush.
    const active = this.rooms.getIfActive(boardId);
    if (!active) return;
    try {
      const room = await active;
      room.applyUpdate(update);
      this.server.to(boardId).emit(SYNC_EVENTS.update, update);
    } catch (err) {
      this.logger.warn(`dropped remote update for board ${boardId}: ${String(err)}`);
    }
  }

  /**
   * Reconcile a live board with the other instances after a Redis outage, in
   * which updates published on either side were dropped. Pull their live
   * states into our room (fanning out only what our clients missed), then
   * publish what each of them lacks. Every instance that saw the outage does
   * the same, so a request that raced another instance's own re-subscribe is
   * covered by that instance's catch-up. Awareness was lost too, so every
   * client re-announces its cursor.
   */
  private async catchUp(boardId: string): Promise<void> {
    const active = this.rooms.getIfActive(boardId);
    if (!active) return;
    try {
      const remote = await this.liveState.collectRemote(boardId);
      // The last local client may have left while we waited.
      const current = this.rooms.getIfActive(boardId);
      if (!current) return;
      const room = await current;

      const missed: Uint8Array[] = [];
      const capture = (update: Uint8Array): void => {
        missed.push(update);
      };
      room.ydoc.on('update', capture);
      try {
        for (const state of remote) room.applyUpdate(state);
      } finally {
        room.ydoc.off('update', capture);
      }
      if (missed.length > 0) this.server.to(boardId).emit(SYNC_EVENTS.update, Y.mergeUpdates(missed));

      // Only what the others lack (per their own state vectors), not our whole doc.
      const lacking = remote.map((state) =>
        Y.encodeStateAsUpdate(room.ydoc, Y.encodeStateVectorFromUpdate(state)),
      );
      if (lacking.length > 0) this.bridge.publish(boardId, Y.mergeUpdates(lacking));

      this.server.to(boardId).emit(SYNC_EVENTS.awarenessRequest);
      this.bridge.publishAwarenessRequest(boardId);
    } catch (err) {
      this.logger.warn(`catch-up after Redis reconnect failed for board ${boardId}: ${String(err)}`);
    }
  }

  /**
   * Restore `docVersion` as a new forward version. The doc is reconciled (deletes
   * + sets across every restorable map) against the CURRENT state merged from
   * every instance — latest snapshot, our live room and other instances' live
   * rooms — so edits still inside any instance's flush debounce are rolled back
   * too. The produced update is applied to our room, emitted to our clients and
   * published through the bridge, converging live rooms everywhere.
   * The reconciled state (not the old bytes) is persisted: old bytes lack the
   * deletes and would resurrect removed elements as soon as a client merged its
   * state back in.
   * Edits made after the state was collected are concurrent with the restore
   * and merge with it like any concurrent CRDT edit (e.g. a shape added during
   * the restore survives it); that is the intended semantics, not a race to fix.
   * Returns the new docVersion, or null when the version does not exist.
   */
  async restoreVersion(boardId: string, docVersion: number, userId: string): Promise<number | null> {
    const target = await this.snapshots.getByVersion(boardId, docVersion);
    if (!target) return null;

    const current = await this.liveState.collect(boardId);
    const doc = new Y.Doc();
    try {
      if (current) Y.applyUpdate(doc, current);
      let update: Uint8Array | null;
      try {
        update = reconcileToSnapshot(doc, target);
      } catch (err) {
        this.logger.warn(`version ${docVersion} of board ${boardId} is not restorable: ${String(err)}`);
        throw new UnprocessableEntityException('This version cannot be restored');
      }
      if (update) {
        const active = this.rooms.getIfActive(boardId);
        if (active) (await active).applyUpdate(update); // our room (then flushed as usual)
        this.server.to(boardId).emit(SYNC_EVENTS.update, update); // local clients
        this.bridge.publish(boardId, update); // other instances apply + emit
      }
      return await this.snapshots.save(boardId, Y.encodeStateAsUpdate(doc), userId, 'restore');
    } finally {
      doc.destroy();
    }
  }

  async handleConnection(socket: Socket): Promise<void> {
    this.limiters.set(socket.id, new SocketRateLimiter());
    const session = this.admit(socket);
    this.sessions.set(socket.id, session);
    await session;
  }

  /**
   * Spend one message from the socket's budget for `kind`. Checked before the
   * handshake wait and any parsing, so a flood costs as little as possible.
   * Over budget: drop (one warning per streak); flooding for the whole abuse
   * window: disconnect.
   */
  private withinRate(socket: Socket, kind: RateClass): boolean {
    const limiter = this.limiters.get(socket.id);
    if (!limiter) return true; // unregistered: sessionFor drops it anyway
    const verdict = limiter.check(kind);
    if (verdict.allowed) return true;
    if (verdict.abusive) {
      if (!socket.disconnected) {
        this.logger.warn(
          `disconnecting socket ${socket.id}: over its ${kind} rate limit for too long (${limiter.dropped} messages dropped)`,
        );
        this.fail(socket, 'rate-limited', 'Too many messages');
      }
    } else if (verdict.startedDropping) {
      this.logger.warn(`socket ${socket.id} exceeded the ${kind} rate limit; dropping its messages until it slows down`);
    }
    return false;
  }

  private async admit(socket: Socket): Promise<SocketState | null> {
    try {
      const token = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as string | undefined;
      const boardId = socket.handshake.query?.boardId as string | undefined;
      if (!token || !boardId) return this.fail(socket, 'unauthorized', 'Missing token or board');

      let payload: AccessTokenClaims;
      try {
        payload = this.tokens.verifyAccessToken(token);
      } catch {
        return this.fail(socket, 'unauthorized', 'Invalid token');
      }
      // Logout and refresh-reuse detection denylist the token's jti; refuse it
      // here too, or a revoked token could keep a live session until it expires.
      if (typeof payload.jti === 'string' && (await this.tokens.isAccessTokenRevoked(payload.jti))) {
        return this.fail(socket, 'unauthorized', 'Token revoked');
      }
      const userId = payload.sub;
      const expiresAt = typeof payload.exp === 'number' ? payload.exp * 1000 : null;

      const role = await this.boards.getMemberRole(boardId, userId);
      if (!role) return this.fail(socket, 'forbidden', 'Not a member of this board');

      const st: SocketState = {
        socketId: socket.id,
        userId,
        boardId,
        role,
        expiresAt,
        claimed: new Set(),
        awareness: new Map(),
        lastAwarenessWarnAt: 0,
      };
      await socket.join(boardId);

      // Subscribe before loading, so updates other instances publish while the
      // snapshot loads are applied on top of it rather than missed.
      this.bridge.register(boardId);
      let room;
      try {
        room = await this.rooms.acquire(boardId);
      } catch (err) {
        this.bridge.unregister(boardId);
        throw err;
      }
      // initial server → client sync (full state)
      socket.emit(SYNC_EVENTS.serverSync, room.encodeState());
      // Ask peers already in the room — here and on other instances — to
      // re-broadcast their Awareness so this newcomer renders their cursors and
      // names right away. Awareness has no server-side state to replay.
      socket.to(boardId).emit(SYNC_EVENTS.awarenessRequest);
      this.bridge.publishAwarenessRequest(boardId);
      this.scheduleExpiry(socket, st);
      return st;
    } catch (err) {
      this.logger.error(`connection error: ${String(err)}`);
      return this.fail(socket, 'unauthorized', 'Connection failed');
    }
  }

  /** Disconnect when the access token lapses; the client reconnects with a fresh one. */
  private scheduleExpiry(socket: Socket, st: SocketState): void {
    if (st.expiresAt === null) return;
    const delay = st.expiresAt - Date.now();
    if (delay > MAX_TIMER_MS) return;
    const timer = setTimeout(() => {
      this.expiryTimers.delete(socket.id);
      this.fail(socket, 'unauthorized', 'Session expired');
    }, Math.max(0, delay));
    timer.unref?.();
    this.expiryTimers.set(socket.id, timer);
  }

  /** Wait for the socket's handshake; null when it was rejected or never ran. */
  private async sessionFor(socket: Socket): Promise<SocketState | null> {
    const session = this.sessions.get(socket.id);
    if (!session) {
      this.logger.warn(`dropped message from unregistered socket ${socket.id}`);
      return null;
    }
    const st = await session;
    if (st && st.expiresAt !== null && Date.now() >= st.expiresAt) {
      this.logger.warn(`dropped message from ${st.userId} on board ${st.boardId}: token expired`);
      this.fail(socket, 'unauthorized', 'Session expired');
      return null;
    }
    return st;
  }

  @SubscribeMessage(SYNC_EVENTS.clientSync)
  async onClientSync(@ConnectedSocket() socket: Socket, @MessageBody() update: unknown): Promise<void> {
    if (!this.withinRate(socket, 'sync')) return;
    const st = await this.sessionFor(socket);
    if (!st) return;
    if (st.role === 'viewer') {
      this.logger.warn(`dropped client-sync from viewer ${st.userId} on board ${st.boardId}`);
      return;
    }
    await this.safeRelay(socket, st, update);
  }

  @SubscribeMessage(SYNC_EVENTS.update)
  async onUpdate(@ConnectedSocket() socket: Socket, @MessageBody() update: unknown): Promise<void> {
    if (!this.withinRate(socket, 'update')) return;
    const st = await this.sessionFor(socket);
    if (!st) return;
    if (st.role === 'viewer') {
      this.logger.warn(`dropped update from viewer ${st.userId} on board ${st.boardId}`);
      return;
    }
    await this.safeRelay(socket, st, update);
  }

  /**
   * Relay awareness (cursors, selections) from one client to all other clients in
   * the room — both on this instance and on other instances via Redis.
   * Awareness is NOT applied to the room doc and NOT persisted.
   * Viewers are allowed: they have cursors too. Each entry is screened (see
   * awareness-guard): only the offending entries are dropped, and the update
   * is re-encoded when any were.
   */
  @SubscribeMessage(SYNC_EVENTS.awareness)
  async onAwareness(@ConnectedSocket() socket: Socket, @MessageBody() raw: unknown): Promise<void> {
    if (!this.withinRate(socket, 'awareness')) return;
    const st = await this.sessionFor(socket);
    if (!st) return;
    const bytes = toBytes(raw);
    if (!bytes) {
      this.warnAwareness(st, 'dropped a non-binary awareness payload');
      return;
    }
    const entries = decodeAwarenessEntries(bytes);
    if (!entries) {
      this.warnAwareness(st, 'dropped a malformed awareness update');
      return;
    }
    const { accepted, rejected, bound, released } = screenAwareness(entries, st, this.claims);
    // Published before the awareness below, on the same connection: Redis keeps
    // the order, so every instance knows the owner before it sees the clientID.
    if (bound.length > 0) {
      this.bridge.publishClaims(st.boardId, {
        op: 'claim',
        claims: bound.map((clientId) => ({ clientId, userId: st.userId })),
      });
    }
    if (released.length > 0) this.bridge.publishClaims(st.boardId, { op: 'release', clientIds: released });
    if (rejected.length > 0) {
      const reasons = Array.from(new Set(rejected.map((r) => r.reason))).join(', ');
      this.warnAwareness(st, `dropped ${rejected.length} awareness entr(ies): ${reasons}`);
    }
    if (accepted.length === 0) return;
    const out = rejected.length === 0 ? bytes : encodeAwarenessUpdate(accepted);
    socket.to(st.boardId).emit(SYNC_EVENTS.awareness, out); // same-instance peers
    this.bridge.publishAwareness(st.boardId, out);           // other instances
  }

  /** Relay awareness from another instance, minus entries for clientIDs a local socket owns. */
  private relayRemoteAwareness(boardId: string, update: Uint8Array): void {
    const entries = decodeAwarenessEntries(update);
    if (!entries) {
      this.logger.warn(`dropped a malformed awareness update from another instance for board ${boardId}`);
      return;
    }
    const accepted = screenRemoteAwareness(entries, boardId, this.claims);
    if (accepted.length === 0) return;
    const out = accepted.length === entries.length ? update : encodeAwarenessUpdate(accepted);
    this.server.to(boardId).emit(SYNC_EVENTS.awareness, out);
  }

  private announceClaims(boardId: string): void {
    const claims = this.claims.localClaimsOf(boardId);
    if (claims.length > 0) this.bridge.publishClaims(boardId, { op: 'claim', claims });
  }

  /** Another instance's sockets bound, released, or wants to (re)learn clientIDs on a board. */
  private onRemoteClaim(boardId: string, instanceId: string, msg: ClaimMessage): void {
    if (msg.op === 'refresh') {
      this.announceClaims(boardId);
      return;
    }
    if (msg.op === 'release') {
      this.claims.releaseRemote(boardId, instanceId, msg.clientIds);
      return;
    }
    for (const { clientId, userId } of msg.claims) {
      if (this.claims.applyRemoteClaim(boardId, instanceId, clientId, userId) === 'conflict') {
        // Two instances bound one clientID to different users at the same
        // moment. Each keeps its own; ours re-announces, theirs stays refused here.
        this.logger.warn(
          `conflicting awareness claim for client ${clientId} on board ${boardId} from instance ${instanceId}`,
        );
      }
    }
  }

  private warnAwareness(st: SocketState, message: string): void {
    const now = Date.now();
    if (now - st.lastAwarenessWarnAt < AWARENESS_WARN_INTERVAL_MS) return;
    st.lastAwarenessWarnAt = now;
    this.logger.warn(`${message} (user ${st.userId}, board ${st.boardId}, socket ${st.socketId})`);
  }

  /**
   * Answer a clock request through the socket.io acknowledgement: returning a
   * value from a handler makes Nest call the client's ack with it. Viewers may
   * ask (they watch the shared timer too); a rejected socket gets no ack, so the
   * client's ack timeout decides what to do.
   */
  @SubscribeMessage(SYNC_EVENTS.clock)
  async onClock(@ConnectedSocket() socket: Socket): Promise<ClockAck | undefined> {
    if (!this.withinRate(socket, 'clock')) return undefined;
    const st = await this.sessionFor(socket);
    if (!st) return undefined;
    return { serverNow: Date.now() };
  }

  /** Validate, parse, apply and fan out an inbound binary payload; never throws. */
  private async safeRelay(socket: Socket, st: SocketState, raw: unknown): Promise<void> {
    const bytes = toBytes(raw);
    if (!bytes) {
      this.logger.warn(`dropped non-binary payload on board ${st.boardId}`);
      return;
    }
    try {
      await this.relay(socket, st, bytes);
    } catch (err) {
      this.logger.warn(`dropped unparseable update on board ${st.boardId}: ${String(err)}`);
    }
  }

  private async relay(socket: Socket, st: SocketState, update: Uint8Array): Promise<void> {
    const room = await this.rooms.getOrCreate(st.boardId);
    room.applyUpdate(update);
    // fan out to other clients on THIS instance...
    socket.to(st.boardId).emit(SYNC_EVENTS.update, update);
    // ...and to clients on OTHER instances via Redis.
    this.bridge.publish(st.boardId, update);
  }

  /**
   * Re-check the live sockets a membership change affects on this instance:
   * revoked (or board deleted) → disconnect; otherwise adopt the current role,
   * so an editor demoted to viewer cannot write another update.
   */
  private async onAccessChange({ boardId, userId }: BoardAccessChange): Promise<void> {
    for (const [socketId, session] of Array.from(this.sessions)) {
      const st = await session;
      if (!st || st.boardId !== boardId) continue;
      if (userId !== null && st.userId !== userId) continue;
      const socket = this.server.sockets.sockets.get(socketId);
      if (!socket) continue;
      try {
        const role = await this.boards.getMemberRole(boardId, st.userId);
        if (role) st.role = role;
        else this.fail(socket, 'forbidden', 'Your access to this board was removed');
      } catch (err) {
        // Fail closed: if we cannot confirm access, the socket must not keep it.
        this.logger.warn(`access re-check failed for ${st.userId} on board ${boardId}: ${String(err)}`);
        this.fail(socket, 'forbidden', 'Could not verify board access');
      }
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    this.limiters.delete(socket.id);
    const session = this.sessions.get(socket.id);
    if (!session) return;
    const timer = this.expiryTimers.get(socket.id);
    if (timer) clearTimeout(timer);
    this.expiryTimers.delete(socket.id);
    // Awaiting the handshake means a socket that drops mid-auth is cleaned up
    // after acquire()/register() ran, never before — so counts can't leak.
    const st = await session;
    this.sessions.delete(socket.id);
    if (!st) return;
    this.broadcastAwarenessRemoval(st);
    const releasedIds = this.claims.release(st);
    if (releasedIds.length > 0) this.bridge.publishClaims(st.boardId, { op: 'release', clientIds: releasedIds });
    const active = this.rooms.getIfActive(st.boardId);
    const room = active ? await active : null;
    const remaining = room ? room.removeClient() : 0;
    this.bridge.unregister(st.boardId);
    if (remaining === 0) {
      // Unsubscribed now, so we would miss the releases: forget them instead;
      // the next joiner's refresh request fetches the current ones.
      this.claims.dropRemoteBoard(st.boardId);
      await this.rooms.releaseIdle(st.boardId);
    }
  }

  /** Without this, peers keep the dropped client's cursor until awareness times out (~30 s). */
  private broadcastAwarenessRemoval(st: SocketState): void {
    if (st.awareness.size === 0) return;
    const removal = encodeAwarenessRemoval(
      Array.from(st.awareness, ([clientId, clock]) => ({ clientId, clock })),
    );
    this.server.to(st.boardId).emit(SYNC_EVENTS.awareness, removal);
    this.bridge.publishAwareness(st.boardId, removal);
  }

  private fail(socket: Socket, code: SyncErrorCode, message: string): null {
    socket.emit(SYNC_EVENTS.error, { code, message });
    socket.disconnect(true);
    return null;
  }
}
