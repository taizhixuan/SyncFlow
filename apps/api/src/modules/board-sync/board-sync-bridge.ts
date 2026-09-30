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

type ChannelKind = 'updates' | 'awareness' | 'awareness-request' | 'access';

const CHANNEL_PATTERN = /^board:(.+):(updates|awareness|awareness-request|access)$/;

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

type UpdateHandler = (boardId: string, update: Uint8Array) => void;
type BoardHandler = (boardId: string) => void;

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

  constructor(private readonly redis: RedisService) {}

  onModuleInit(): void {
    // Obtain the client here (not in the constructor) so RedisService.onModuleInit
    // has already run and this.client is initialized before we call getClient().
    this.pub = this.redis.getClient();
    // A subscriber connection cannot run normal commands, so use a dedicated one.
    this.sub = this.pub.duplicate();
    this.sub.on('messageBuffer', (channel: Buffer, message: Buffer) => {
      const parsed = parseChannel(channel.toString('utf8'));
      if (!parsed) return;
      const { boardId, kind } = parsed;
      // Access messages come from BoardAccessEvents, which frames and de-dups
      // its own payloads, so they are handed over raw.
      if (kind === 'access') {
        this.accessHandler?.(boardId, new Uint8Array(message));
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
