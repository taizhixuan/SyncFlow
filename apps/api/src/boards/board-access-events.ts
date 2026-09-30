import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * A membership change that live sockets must react to. `userId: null` means
 * every member lost access at once (the board was deleted).
 */
export interface BoardAccessChange {
  boardId: string;
  userId: string | null;
}

type AccessListener = (change: BoardAccessChange) => void;

export function accessChannelFor(boardId: string): string {
  return `board:${boardId}:access`;
}

interface AccessWireMessage {
  origin: string;
  userId: string | null;
}

function parseWire(payload: Uint8Array): AccessWireMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload).toString('utf8'));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { origin, userId } = value as Record<string, unknown>;
  if (typeof origin !== 'string') return null;
  if (userId !== null && typeof userId !== 'string') return null;
  return { origin, userId };
}

/**
 * Announces membership changes to the realtime layer. REST mutations happen on
 * whichever instance served the request, but the affected sockets may live on
 * any instance, so a change is delivered in-process and also published on the
 * board's Redis access channel (routed back in by the sync bridge).
 */
@Injectable()
export class BoardAccessEvents {
  private readonly logger = new Logger(BoardAccessEvents.name);
  readonly instanceId = randomUUID();
  private readonly listeners = new Set<AccessListener>();

  constructor(private readonly redis: RedisService) {}

  subscribe(listener: AccessListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(change: BoardAccessChange): void {
    this.deliver(change);
    const wire: AccessWireMessage = { origin: this.instanceId, userId: change.userId };
    const channel = accessChannelFor(change.boardId);
    this.redis
      .getClient()
      .publish(channel, Buffer.from(JSON.stringify(wire)))
      .catch((err: Error) => this.logger.warn(`publish to ${channel} failed: ${err.message}`));
  }

  /** A change another instance published; our own echoes were already delivered. */
  receive(boardId: string, payload: Uint8Array): void {
    const wire = parseWire(payload);
    if (!wire) {
      this.logger.warn(`dropped malformed access message for board ${boardId}`);
      return;
    }
    if (wire.origin === this.instanceId) return;
    this.deliver({ boardId, userId: wire.userId });
  }

  private deliver(change: BoardAccessChange): void {
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (err) {
        this.logger.warn(`access listener failed for board ${change.boardId}: ${String(err)}`);
      }
    }
  }
}
