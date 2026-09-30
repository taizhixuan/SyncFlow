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

type ChannelKind = 'updates' | 'awareness' | 'awareness-request' | 'access' | 'state-request';

const CHANNEL_PATTERN = /^board:(.+):(updates|awareness|awareness-request|access|state-request)$/;

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
  private handler: UpdateHandler | null = null;
  private awarenessHandler: UpdateHandler | null = null;
  private awarenessRequestHandler: BoardHandler | null = null;
  private accessHandler: UpdateHandler | null = null;
  private stateRequestHandler: StateRequestHandler | null = null;
  private stateReplyHandler: StateReplyHandler | null = null;

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
      const { instanceId, update } = decodeFrame(message);
      if (instanceId === this.instanceId) return; // our own echo
      if (kind === 'awareness') this.awarenessHandler?.(boardId, update);
      else if (kind === 'awareness-request') this.awarenessRequestHandler?.(boardId);
      else this.handler?.(boardId, update);
    });
    this.sub.on('error', (err: Error) =>
      this.logger.warn(`Redis subscriber error: ${err.message}`),
    );
    this.subscribeChannel(replyChannel);
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
      .catch((err: Error) => this.logger.warn(`publish to ${channel} failed: ${err.message}`));
  }

  publish(boardId: string, update: Uint8Array): void {
    this.pub
      .publish(channelFor(boardId), encodeFrame(this.instanceId, update))
      .catch((err: Error) =>
        this.logger.warn(`publish to ${channelFor(boardId)} failed: ${err.message}`),
      );
  }

  publishAwareness(boardId: string, update: Uint8Array): void {
    this.pub
      .publish(awarenessChannelFor(boardId), encodeFrame(this.instanceId, update))
      .catch((err: Error) =>
        this.logger.warn(`publish to ${awarenessChannelFor(boardId)} failed: ${err.message}`),
      );
  }

  /** Ask peers on other instances to re-broadcast their awareness for a newcomer. */
  publishAwarenessRequest(boardId: string): void {
    const channel = awarenessRequestChannelFor(boardId);
    this.pub
      .publish(channel, encodeFrame(this.instanceId, new Uint8Array()))
      .catch((err: Error) => this.logger.warn(`publish to ${channel} failed: ${err.message}`));
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

  register(boardId: string): void {
    const next = (this.counts.get(boardId) ?? 0) + 1;
    this.counts.set(boardId, next);
    if (next === 1) {
      for (const channel of channelsFor(boardId)) this.subscribeChannel(channel);
    }
  }

  unregister(boardId: string): void {
    if (!this.counts.has(boardId)) return;
    const next = (this.counts.get(boardId) ?? 1) - 1;
    if (next <= 0) {
      this.counts.delete(boardId);
      for (const channel of channelsFor(boardId)) this.unsubscribeChannel(channel);
    } else {
      this.counts.set(boardId, next);
    }
  }
}
