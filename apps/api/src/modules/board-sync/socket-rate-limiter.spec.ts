import {
  ABUSE_DISCONNECT_MS,
  RATE_LIMITS,
  SocketRateLimiter,
  TokenBucket,
} from './socket-rate-limiter';

describe('TokenBucket', () => {
  it('allows a burst up to capacity, then refills at the configured rate', () => {
    let now = 0;
    const bucket = new TokenBucket({ burst: 3, perSecond: 2 }, now);
    expect([bucket.take(now), bucket.take(now), bucket.take(now), bucket.take(now)]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    now += 500; // +1 token
    expect(bucket.take(now)).toBe(true);
    expect(bucket.take(now)).toBe(false);
  });

  it('never refills above its burst capacity', () => {
    const bucket = new TokenBucket({ burst: 2, perSecond: 100 }, 0);
    const at = 60_000;
    expect([bucket.take(at), bucket.take(at), bucket.take(at)]).toEqual([true, true, false]);
  });
});

describe('RATE_LIMITS', () => {
  it('is generous for doc updates and tight for clock pings', () => {
    expect(RATE_LIMITS.update).toEqual({ burst: 200, perSecond: 100 });
    expect(RATE_LIMITS.awareness.perSecond).toBe(60);
    expect(RATE_LIMITS.clock.perSecond).toBe(5);
  });
});

describe('SocketRateLimiter', () => {
  function limiter() {
    let now = 1_000;
    const l = new SocketRateLimiter(() => now);
    return { l, advance: (ms: number) => (now += ms) };
  }

  it('keeps a separate bucket per event class', () => {
    const { l } = limiter();
    for (let i = 0; i < RATE_LIMITS.clock.burst; i += 1) expect(l.check('clock').allowed).toBe(true);
    expect(l.check('clock').allowed).toBe(false);
    expect(l.check('update').allowed).toBe(true);
    expect(l.check('awareness').allowed).toBe(true);
  });

  it('flags only the first drop of a streak, so the caller logs once rather than per message', () => {
    const { l } = limiter();
    for (let i = 0; i < RATE_LIMITS.clock.burst; i += 1) l.check('clock');
    const first = l.check('clock');
    const second = l.check('clock');
    expect(first).toMatchObject({ allowed: false, startedDropping: true, abusive: false });
    expect(second).toMatchObject({ allowed: false, startedDropping: false, abusive: false });
    expect(l.dropped).toBe(2);
  });

  it('forgives a short burst over the limit', () => {
    const { l, advance } = limiter();
    for (let i = 0; i < RATE_LIMITS.update.burst + 50; i += 1) l.check('update');
    advance(3_000); // quiet: the streak ends and the bucket refills
    const verdict = l.check('update');
    expect(verdict).toMatchObject({ allowed: true, abusive: false });
  });

  it('reports a socket that stays over its limit for the whole abuse window as abusive', () => {
    const { l, advance } = limiter();
    let abusive = false;
    // 400 updates/s — four times the sustained rate — for longer than the window.
    for (let t = 0; t <= ABUSE_DISCONNECT_MS + 2_000 && !abusive; t += 10) {
      for (let i = 0; i < 4; i += 1) abusive = l.check('update').abusive || abusive;
      advance(10);
    }
    expect(abusive).toBe(true);
  });

  it('starts a new streak after a quiet second, so intermittent bursts are not abuse', () => {
    const { l, advance } = limiter();
    let abusive = false;
    for (let round = 0; round < 10; round += 1) {
      // Over the clock limit briefly, then quiet long enough to refill.
      for (let i = 0; i < RATE_LIMITS.clock.burst + 3; i += 1) abusive = l.check('clock').abusive || abusive;
      advance(2_500);
    }
    expect(abusive).toBe(false);
  });
});
