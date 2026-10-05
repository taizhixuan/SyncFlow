import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { RedisService } from '../../redis/redis.service';
import { accessChannelFor } from '../../boards/board-access-events';

export const INSTANCE_ID_BYTES = 36; // a UUID string is 36 chars

export function channelFor(boardId: string): string {
  return `board:${boardId}:updates`;
}

export function awarenessChannelFor(boardId: string): string {
  return `board:${boardId}:awareness`;
}

export function awarenessRequestChannelFor(boardId: string): string {
  return `board:${boardId}:awareness-request`;
}

/** Asks every instance holding a live room for the board to send its doc state. */
export function stateRequestChannelFor(boardId: string): string {
  return `board:${boardId}:state-request`;
}

/**
 * Replies are addressed to one instance rather than broadcast on the board, so
 * a multi-MB state only travels to the instance that asked for it.
 */
export function stateReplyChannelFor(instanceId: string): string {
  return `instance:${instanceId}:state-reply`;
}

/**
 * Which instance's socket owns each awareness clientID. Each instance only sees
 * its own sockets, so without this a socket on instance B could bind a clientID
 * another user owns on instance A and overwrite that cursor for B's clients.
 */
export function claimsChannelFor(boardId: string): string {
  return `board:${boardId}:awareness-claims`;
}

type ChannelKind = 'updates' | 'awareness' | 'awareness-request' | 'access' | 'state-request' | 'awareness-claims';

const CHANNEL_PATTERN =
  /^board:(.+):(updates|awareness|awareness-request|access|state-request|awareness-claims)$/;

/** Longer than any id we issue (UUIDs), short enough that a claim frame stays small. */
export const MAX_CLAIM_USER_ID_LENGTH = 128;
/** A re-announcement batches every claim of a board; far above any real board's client count. */
const MAX_CLAIMS_PER_FRAME = 5000;
/** Yjs clientIDs are random uint32s. */
const MAX_CLIENT_ID = 2 ** 32 - 1;

export type ClaimMessage =
  | { op: 'claim'; claims: Array<{ clientId: number; userId: string }> }
  | { op: 'release'; clientIds: number[] }
  /** Ask every instance holding the board to re-announce its claims. */
  | { op: 'refresh' };

function isClientId(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_CLIENT_ID;
}

function isUserId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_CLAIM_USER_ID_LENGTH;
}

/** Validate a claim message body; null (drop) for anything not exactly one of the known shapes. */
export function parseClaimMessage(bytes: Uint8Array): ClaimMessage | null {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const msg = raw as Record<string, unknown>;
  if (msg.op === 'refresh') return { op: 'refresh' };
  if (msg.op === 'release') {
    const ids = msg.clientIds;
    if (!Array.isArray(ids) || ids.length > MAX_CLAIMS_PER_FRAME || !ids.every(isClientId)) return null;
    return { op: 'release', clientIds: ids };
  }
  if (msg.op === 'claim') {
    const claims = msg.claims;
    if (!Array.isArray(claims) || claims.length > MAX_CLAIMS_PER_FRAME) return null;
    const out: Array<{ clientId: number; userId: string }> = [];
    for (const claim of claims) {
      if (typeof claim !== 'object' || claim === null) return null;
      const { clientId, userId } = claim as Record<string, unknown>;
      if (!isClientId(clientId) || !isUserId(userId)) return null;
      out.push({ clientId, userId });
    }
    return { op: 'claim', claims: out };
  }
  return null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_ID_BYTES = 36; // a UUID string, like the instance id

/** Parse a channel into its boardId and kind. Returns null for unrecognised channels. */
function parseChannel(channel: string): { boardId: string; kind: ChannelKind } | null {
  const match = CHANNEL_PATTERN.exec(channel);
  if (!match) return null;
  return { boardId: match[1]!, kind: match[2] as ChannelKind };
}

function channelsFor(boardId: string): string[] {
  return [
    channelFor(boardId),
    awarenessChannelFor(boardId),
    awarenessRequestChannelFor(boardId),
    accessChannelFor(boardId),
    stateRequestChannelFor(boardId),
    claimsChannelFor(boardId),
  ];
}

export function encodeFrame(instanceId: string, update: Uint8Array): Buffer {
  return Buffer.concat([Buffer.from(instanceId, 'utf8'), Buffer.from(update)]);
}

export function decodeFrame(frame: Buffer): { instanceId: string; update: Uint8Array } {
  const instanceId = frame.subarray(0, INSTANCE_ID_BYTES).toString('utf8');
  const update = new Uint8Array(frame.subarray(INSTANCE_ID_BYTES));
  return { instanceId, update };
}

/** Another instance's answer to one of our state requests. */
export interface StateReply {
  requestId: string;
  instanceId: string;
  /** Encoded Yjs state; empty when the instance no longer holds the room. */
  state: Uint8Array;
}

type UpdateHandler = (boardId: string, update: Uint8Array) => void;
type BoardHandler = (boardId: string) => void;
type StateRequestHandler = (boardId: string, requesterId: string, requestId: string) => void;
type StateReplyHandler = (reply: StateReply) => void;
type ResyncHandler = (boardIds: string[]) => void;
type ClaimHandler = (boardId: string, instanceId: string, msg: ClaimMessage) => void;
type ConnectionRole = 'publisher' | 'subscriber';

/**
 * The publisher and subscriber usually drop and return together (Redis itself
 * restarted); waiting this long after a 'ready' lets both come back so one
 * outage costs one resync, not two.
 */
export const RESYNC_DEBOUNCE_MS = 250;

/** During an outage every edit fails to publish; one warning per window is enough. */
const PUBLISH_WARN_INTERVAL_MS = 5000;

/** Split a request/reply frame body into its request id and the rest; null when malformed. */
function splitRequestId(frame: Buffer): { instanceId: string; requestId: string; rest: Uint8Array } | null {
  if (frame.length < INSTANCE_ID_BYTES + REQUEST_ID_BYTES) return null;
  const { instanceId, update } = decodeFrame(frame);
  const requestId = Buffer.from(update.subarray(0, REQUEST_ID_BYTES)).toString('utf8');
  if (!UUID_PATTERN.test(instanceId) || !UUID_PATTERN.test(requestId)) return null;
  return { instanceId, requestId, rest: update.subarray(REQUEST_ID_BYTES) };
}

/**
 * Fans Yjs updates across API instances via Redis pub/sub. Each instance stamps
 * its publishes with a per-process id and ignores its own messages (echo dedup).
 */
@Injectable()
export class BoardSyncBridge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BoardSyncBridge.name);
  readonly instanceId = randomUUID();
  private pub!: Redis;
  private sub!: Redis;
  private readonly counts = new Map<string, number>();
  /** Per registered board, settles once its SUBSCRIBE was answered. */
  private readonly subscriptions = new Map<string, Promise<void>>();
  private handler: UpdateHandler | null = null;
  private awarenessHandler: UpdateHandler | null = null;
  private awarenessRequestHandler: BoardHandler | null = null;
  private accessHandler: UpdateHandler | null = null;
  private stateRequestHandler: StateRequestHandler | null = null;
  private stateReplyHandler: StateReplyHandler | null = null;
  private resyncHandler: ResyncHandler | null = null;
  private claimHandler: ClaimHandler | null = null;
  /** Connections that dropped since their last 'ready'; a resync waits until this is empty. */
  private readonly lost = new Set<ConnectionRole>();
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private failedPublishes = 0;
  private lastPublishWarnAt = 0;
  private nodeLocalCounts = false;

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    // Obtain the client here (not in the constructor) so RedisService.onModuleInit
    // has already run and this.client is initialized before we call getClient().
    this.pub = this.redis.getClient();
    // A subscriber connection cannot run normal commands, so use a dedicated one.
    this.sub = this.pub.duplicate();
    const replyChannel = stateReplyChannelFor(this.instanceId);
    this.sub.on('messageBuffer', (channel: Buffer, message: Buffer) => {
      const name = channel.toString('utf8');
      if (name === replyChannel) {
        this.onStateReply(message);
        return;
      }
      const parsed = parseChannel(name);
      if (!parsed) return;
      const { boardId, kind } = parsed;
      // Access messages come from BoardAccessEvents, which frames and de-dups
      // its own payloads, so they are handed over raw.
      if (kind === 'access') {
        this.accessHandler?.(boardId, new Uint8Array(message));
        return;
      }
      if (kind === 'state-request') {
        this.onStateRequest(boardId, message);
        return;
      }
      if (kind === 'awareness-claims') {
        this.onClaimMessage(boardId, message);
        return;
      }
      const { instanceId, update } = decodeFrame(message);
      if (instanceId === this.instanceId) return; // our own echo
      if (kind === 'awareness') this.awarenessHandler?.(boardId, update);
      else if (kind === 'awareness-request') this.awarenessRequestHandler?.(boardId);
      else this.handler?.(boardId, update);
    });
    this.sub.on('error', (err: Error) =>
      this.logger.warn(`Redis subscriber error: ${err.message}`),
    );
    this.watchConnection(this.pub, 'publisher');
    this.watchConnection(this.sub, 'subscriber');
    this.subscribeChannel(replyChannel);
    this.detectCluster();
  }

  /**
   * Pub/sub is fire-and-forget: whatever was published while a connection was
   * down is gone, and ioredis only replays our SUBSCRIBEs — nothing re-syncs
   * the docs, so instances holding the same board would diverge until their
   * clients reconnect. Track drops so the next 'ready' can reconcile.
   * The first 'ready' (boot) is not a recovery: nothing was held yet.
   */
  private watchConnection(client: Redis, role: ConnectionRole): void {
    const markLost = (): void => {
      if (this.destroyed || this.lost.has(role)) return;
      this.lost.add(role);
      this.logger.warn(`Redis ${role} connection lost; cross-instance sync paused until it returns`);
    };
    client.on('close', markLost);
    client.on('end', markLost);
    client.on('reconnecting', markLost);
    client.on('ready', () => {
      if (!this.lost.delete(role)) return;
      this.logger.log(`Redis ${role} connection is back; resyncing live boards`);
      this.scheduleResync();
    });
  }

  private scheduleResync(): void {
    if (this.resyncTimer) clearTimeout(this.resyncTimer);
    this.resyncTimer = setTimeout(() => {
      this.resyncTimer = null;
      void this.resync();
    }, RESYNC_DEBOUNCE_MS);
    this.resyncTimer.unref?.();
  }

  private async resync(): Promise<void> {
    // The connection still down emits its own 'ready' and schedules this again.
    if (this.destroyed || this.lost.size > 0) return;
    const boardIds = Array.from(this.counts.keys());
    // ioredis auto-resubscribes but gives us nothing to await. SUBSCRIBE is
    // idempotent, so issuing it again guarantees the channels are live before
    // we ask other instances for state (their replies arrive on them).
    const channels = [stateReplyChannelFor(this.instanceId), ...boardIds.flatMap(channelsFor)];
    try {
      await this.sub.subscribe(...channels);
    } catch (err) {
      this.logger.warn(`re-subscribe after reconnect failed; waiting for the next reconnect: ${String(err)}`);
      return;
    }
    if (this.failedPublishes > 0) {
      this.logger.warn(`${this.failedPublishes} publish(es) failed during the outage; the resync repairs them`);
      this.failedPublishes = 0;
    }
    this.detectCluster();
    if (boardIds.length > 0) this.resyncHandler?.(boardIds);
  }

  /**
   * True when PUBLISH's receiver count covers only the node we talk to (Redis
   * Cluster), so it must not be read as the number of instances listening.
   */
  get publishCountIsNodeLocal(): boolean {
    return this.nodeLocalCounts;
  }

  private detectCluster(): void {
    if (this.pub.isCluster) {
      this.nodeLocalCounts = true;
      return;
    }
    // A plain client can still be pointed at one node of a cluster-mode deployment.
    this.pub.info('cluster').then(
      (info) => {
        this.nodeLocalCounts = /^cluster_enabled:1\b/m.test(info);
      },
      (err: Error) => this.logger.warn(`could not detect Redis cluster mode: ${err.message}`),
    );
  }

  /** Never throws into a handler; warns at most once per window so an outage cannot flood the log. */
  private onPublishFailed(channel: string, err: Error): void {
    this.failedPublishes += 1;
    const now = Date.now();
    if (now - this.lastPublishWarnAt < PUBLISH_WARN_INTERVAL_MS) return;
    this.lastPublishWarnAt = now;
    this.logger.warn(`publish to ${channel} failed (${this.failedPublishes} failed so far): ${err.message}`);
  }

  private onStateRequest(boardId: string, message: Buffer): void {
    const frame = splitRequestId(message);
    if (!frame) {
      this.logger.warn(`dropped malformed state request for board ${boardId}`);
      return;
    }
    if (frame.instanceId === this.instanceId) {
      // Our own request, delivered because we hold the room too. The requester
      // merges its local room directly, but PUBLISH counted our subscription
      // as a receiver, so answer it here with an empty state to keep the count.
      this.stateReplyHandler?.({
        requestId: frame.requestId,
        instanceId: this.instanceId,
        state: new Uint8Array(),
      });
      return;
    }
    this.stateRequestHandler?.(boardId, frame.instanceId, frame.requestId);
  }

  private onClaimMessage(boardId: string, message: Buffer): void {
    if (message.length < INSTANCE_ID_BYTES) {
      this.logger.warn(`dropped truncated awareness claim frame for board ${boardId}`);
      return;
    }
    const { instanceId, update } = decodeFrame(message);
    if (instanceId === this.instanceId) return; // our own echo
    const msg = UUID_PATTERN.test(instanceId) ? parseClaimMessage(update) : null;
    if (!msg) {
      this.logger.warn(`dropped malformed awareness claim frame for board ${boardId}`);
      return;
    }
    this.claimHandler?.(boardId, instanceId, msg);
  }

  private onStateReply(message: Buffer): void {
    const frame = splitRequestId(message);
    if (!frame) {
      this.logger.warn('dropped malformed state reply');
      return;
    }
    this.stateReplyHandler?.({
      requestId: frame.requestId,
      instanceId: frame.instanceId,
      state: new Uint8Array(frame.rest),
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.resyncTimer) clearTimeout(this.resyncTimer);
    this.resyncTimer = null;
    // Quit only the subscriber, which this bridge owns. `this.pub` is the shared
    // RedisService client (not bridge-owned) — quitting it here would break every
    // other Redis consumer and double-quit on app shutdown.
    if (this.sub)
      await this.sub.quit().catch((err: Error) => {
        this.logger.warn(`Redis subscriber quit failed, forcing disconnect: ${err.message}`);
        this.sub.disconnect();
      });
  }

  setUpdateHandler(handler: UpdateHandler): void {
    this.handler = handler;
  }

  setAwarenessHandler(handler: UpdateHandler): void {
    this.awarenessHandler = handler;
  }

  setAwarenessRequestHandler(handler: BoardHandler): void {
    this.awarenessRequestHandler = handler;
  }

  setAccessHandler(handler: UpdateHandler): void {
    this.accessHandler = handler;
  }

  setStateRequestHandler(handler: StateRequestHandler): void {
    this.stateRequestHandler = handler;
  }

  setStateReplyHandler(handler: StateReplyHandler): void {
    this.stateReplyHandler = handler;
  }

  /** Called with the boards live here once Redis is back after an outage. */
  setResyncHandler(handler: ResyncHandler): void {
    this.resyncHandler = handler;
  }

  setClaimHandler(handler: ClaimHandler): void {
    this.claimHandler = handler;
  }

  publishClaims(boardId: string, msg: ClaimMessage): void {
    const channel = claimsChannelFor(boardId);
    this.pub
      .publish(channel, encodeFrame(this.instanceId, Buffer.from(JSON.stringify(msg), 'utf8')))
      .catch((err: Error) => this.onPublishFailed(channel, err));
  }

  /**
   * Ask the instances holding a live room for the board for their state.
   * Resolves with PUBLISH's receiver count — the number of subscriptions to the
   * board's request channel, i.e. how many instances (ourselves included, if we
   * hold the room) will answer — so the caller knows when every reply is in.
   * Rejects when Redis is unreachable; the caller decides the fallback.
   */
  publishStateRequest(boardId: string, requestId: string): Promise<number> {
    return this.pub.publish(stateRequestChannelFor(boardId), encodeFrame(this.instanceId, Buffer.from(requestId)));
  }

  publishStateReply(requesterId: string, requestId: string, state: Uint8Array): void {
    const channel = stateReplyChannelFor(requesterId);
    this.pub
      .publish(channel, encodeFrame(this.instanceId, Buffer.concat([Buffer.from(requestId), Buffer.from(state)])))
      .catch((err: Error) => this.onPublishFailed(channel, err));
  }

  publish(boardId: string, update: Uint8Array): void {
    this.pub
      .publish(channelFor(boardId), encodeFrame(this.instanceId, update))
      .catch((err: Error) => this.onPublishFailed(channelFor(boardId), err));
  }

  publishAwareness(boardId: string, update: Uint8Array): void {
    this.pub
      .publish(awarenessChannelFor(boardId), encodeFrame(this.instanceId, update))
      .catch((err: Error) => this.onPublishFailed(awarenessChannelFor(boardId), err));
  }

  /** Ask peers on other instances to re-broadcast their awareness for a newcomer. */
  publishAwarenessRequest(boardId: string): void {
    const channel = awarenessRequestChannelFor(boardId);
    this.pub
      .publish(channel, encodeFrame(this.instanceId, new Uint8Array()))
      .catch((err: Error) => this.onPublishFailed(channel, err));
  }

  /**
   * Fire-and-forget (un)subscribe. ioredis rejects every pending command with
   * "Connection is closed." when the socket drops — on shutdown, or if Redis
   * restarts — and an unhandled rejection terminates the process, so these
   * failures are logged and swallowed exactly like `publish` above.
   */
  private subscribeChannel(channel: string): void {
    this.sub
      .subscribe(channel)
      .catch((err: Error) => this.logger.warn(`subscribe to ${channel} failed: ${err.message}`));
  }

  private unsubscribeChannel(channel: string): void {
    this.sub
      .unsubscribe(channel)
      .catch((err: Error) =>
        this.logger.warn(`unsubscribe from ${channel} failed: ${err.message}`),
      );
  }

  /**
   * Hold the board's channels for one more local user. Resolves once the
   * SUBSCRIBE is confirmed (immediately when it already was), so a caller can
   * fetch other instances' state knowing every later publish reaches it.
   * Never rejects: a failed SUBSCRIBE is logged and the caller carries on.
   */
  register(boardId: string): Promise<void> {
    const next = (this.counts.get(boardId) ?? 0) + 1;
    this.counts.set(boardId, next);
    const existing = this.subscriptions.get(boardId);
    if (next > 1 && existing) return existing;
    // Claims announced before we subscribed never reached us, so ask for them
    // once the claims channel is live. Peers answer before their clients can
    // re-announce awareness (a client round trip), so the claims land first.
    const subscribed = this.sub.subscribe(...channelsFor(boardId)).then(
      () => {
        if (this.counts.has(boardId)) this.publishClaims(boardId, { op: 'refresh' });
      },
      (err: Error) => this.logger.warn(`subscribe to board ${boardId} failed: ${err.message}`),
    );
    this.subscriptions.set(boardId, subscribed);
    return subscribed;
  }

  unregister(boardId: string): void {
    if (!this.counts.has(boardId)) return;
    const next = (this.counts.get(boardId) ?? 1) - 1;
    if (next <= 0) {
      this.counts.delete(boardId);
      this.subscriptions.delete(boardId);
      for (const channel of channelsFor(boardId)) this.unsubscribeChannel(channel);
    } else {
      this.counts.set(boardId, next);
    }
  }
}
