/** The inbound realtime messages a socket may send, each with its own budget. */
export type RateClass = 'update' | 'sync' | 'awareness' | 'clock';

export interface BucketSpec {
  /** Messages that may arrive back to back before limiting starts. */
  burst: number;
  /** Sustained messages per second (the refill rate). */
  perSecond: number;
}

/**
 * Budgets sized well above what the web client sends, so only a misbehaving
 * or hostile socket ever hits them:
 * - update: one message per local Yjs transaction. A 60 fps drag is ~60/s, and
 *   socket.io flushes every update buffered while offline in one go right after
 *   reconnecting; those duplicate the client-sync sent first, so dropping the
 *   tail of such a flush loses nothing.
 * - sync: a full-state client-sync (up to MAX_SOCKET_PAYLOAD_BYTES) sent once
 *   per connection; each is expensive to apply, so allow only a handful.
 * - awareness: cursors are throttled to 20/s client-side, plus selection,
 *   laser and a full re-announce whenever a peer joins.
 * - clock: three samples per connection to estimate the server clock offset.
 */
export const RATE_LIMITS: Readonly<Record<RateClass, BucketSpec>> = {
  update: { burst: 200, perSecond: 100 },
  sync: { burst: 3, perSecond: 0.1 },
  awareness: { burst: 120, perSecond: 60 },
  clock: { burst: 10, perSecond: 5 },
};

/**
 * Drops no more than this far apart belong to one streak. A socket that stays
 * over its limit drops at least once per refill interval, so its streak never
 * breaks; one that bursts and then goes quiet starts afresh next time.
 */
const STREAK_GAP_MS = 1000;

/**
 * A streak this long is a flood, not a burst: the socket is disconnected rather
 * than having every message parsed and discarded for as long as it cares to.
 */
export const ABUSE_DISCONNECT_MS = 5000;

export class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly spec: BucketSpec,
    now: number,
  ) {
    this.tokens = spec.burst;
    this.updatedAt = now;
  }

  take(now: number): boolean {
    const elapsed = Math.max(0, now - this.updatedAt);
    this.tokens = Math.min(this.spec.burst, this.tokens + (elapsed / 1000) * this.spec.perSecond);
    this.updatedAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

export interface RateVerdict {
  allowed: boolean;
  /** This drop began a new streak: the moment worth one log line. */
  startedDropping: boolean;
  /** The socket has been over a limit for ABUSE_DISCONNECT_MS straight. */
  abusive: boolean;
}

/** Per-socket token buckets, one per event class, plus flood detection across them. */
export class SocketRateLimiter {
  private readonly buckets = new Map<RateClass, TokenBucket>();
  private streakStart: number | null = null;
  private lastDropAt = 0;
  private droppedCount = 0;

  constructor(private readonly clock: () => number = Date.now) {}

  /** Messages dropped over the socket's lifetime. */
  get dropped(): number {
    return this.droppedCount;
  }

  check(kind: RateClass): RateVerdict {
    const now = this.clock();
    let bucket = this.buckets.get(kind);
    if (!bucket) {
      bucket = new TokenBucket(RATE_LIMITS[kind], now);
      this.buckets.set(kind, bucket);
    }
    if (bucket.take(now)) return { allowed: true, startedDropping: false, abusive: false };

    this.droppedCount += 1;
    let startedDropping = false;
    if (this.streakStart === null || now - this.lastDropAt > STREAK_GAP_MS) {
      this.streakStart = now;
      startedDropping = true;
    }
    this.lastDropAt = now;
    return { allowed: false, startedDropping, abusive: now - this.streakStart >= ABUSE_DISCONNECT_MS };
  }
}
