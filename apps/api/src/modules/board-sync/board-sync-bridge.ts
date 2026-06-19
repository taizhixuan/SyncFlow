import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { RedisService } from '../../redis/redis.service';

export const INSTANCE_ID_BYTES = 36; // a UUID string is 36 chars

export function channelFor(boardId: string): string {
  return `board:${boardId}:updates`;
}

export function boardIdFromChannel(channel: string): string | null {
  const match = /^board:(.+):updates$/.exec(channel);
  return match ? match[1]! : null;
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

/**
 * Fans Yjs updates across API instances via Redis pub/sub. Each instance stamps
 * its publishes with a per-process id and ignores its own messages (echo dedup).
 */
@Injectable()
export class BoardSyncBridge implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BoardSyncBridge.name);
  readonly instanceId = randomUUID();
  private readonly pub: Redis;
  private sub!: Redis;
  private readonly counts = new Map<string, number>();
  private handler: UpdateHandler | null = null;

  constructor(redis: RedisService) {
    this.pub = redis.getClient();
  }

  onModuleInit(): void {
    // A subscriber connection cannot run normal commands, so use a dedicated one.
    this.sub = this.pub.duplicate();
    this.sub.on('messageBuffer', (channel: Buffer, message: Buffer) => {
      const boardId = boardIdFromChannel(channel.toString('utf8'));
      if (!boardId) return;
      const { instanceId, update } = decodeFrame(message);
      if (instanceId === this.instanceId) return; // our own echo
      this.handler?.(boardId, update);
    });
    this.sub.on('error', (err: Error) => this.logger.warn(`Redis subscriber error: ${err.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sub) await this.sub.quit().catch(() => this.sub.disconnect());
  }

  setUpdateHandler(handler: UpdateHandler): void {
    this.handler = handler;
  }

  publish(boardId: string, update: Uint8Array): void {
    this.pub.publish(channelFor(boardId), encodeFrame(this.instanceId, update));
  }

  register(boardId: string): void {
    const next = (this.counts.get(boardId) ?? 0) + 1;
    this.counts.set(boardId, next);
    if (next === 1) void this.sub.subscribe(channelFor(boardId));
  }

  unregister(boardId: string): void {
    const next = (this.counts.get(boardId) ?? 1) - 1;
    if (next <= 0) {
      this.counts.delete(boardId);
      void this.sub.unsubscribe(channelFor(boardId));
    } else {
      this.counts.set(boardId, next);
    }
  }
}
