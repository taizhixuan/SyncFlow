import type { RawAwarenessEntry } from './awareness-codec';
import {
  AwarenessClaims,
  CLAIM_REFRESH_INTERVAL_MS,
  MAX_AWARENESS_CLIENTS_PER_SOCKET,
  REMOTE_CLAIM_TTL_MS,
  MAX_AWARENESS_STATE_BYTES,
  MAX_PRESENCE_COLOR_LENGTH,
  MAX_PRESENCE_NAME_LENGTH,
  screenAwareness,
  screenRemoteAwareness,
  type AwarenessClaimant,
} from './awareness-guard';

function claimant(socketId: string, userId: string, boardId = 'b1'): AwarenessClaimant {
  return { socketId, userId, boardId, claimed: new Set(), awareness: new Map() };
}

function entry(clientId: number, state: unknown, clock = 1): RawAwarenessEntry {
  return { clientId, clock, state: typeof state === 'string' ? state : JSON.stringify(state) };
}

const me = (extra: Record<string, unknown> = {}) => ({ user: { id: 'u1', name: 'Ada', color: '#0f0' }, ...extra });

describe('screenAwareness: identity', () => {
  it("accepts a state carrying the socket's own user id and binds the clientID to the socket", () => {
    const claims = new AwarenessClaims();
    const a = claimant('s1', 'u1');
    const out = screenAwareness([entry(10, me({ cursor: { x: 1, y: 2 } }), 3)], a, claims);
    expect(out.rejected).toEqual([]);
    expect(out.accepted).toHaveLength(1);
    expect(claims.ownerOf('b1', 10)).toBe(a);
    expect(a.awareness.get(10)).toBe(3);
  });

  it("rejects a state claiming another user's identity", () => {
    const claims = new AwarenessClaims();
    const out = screenAwareness([entry(10, { user: { id: 'victim', name: 'V', color: '#f00' } })], claimant('s1', 'u1'), claims);
    expect(out.accepted).toEqual([]);
    expect(out.rejected).toEqual([{ clientId: 10, reason: 'spoofed-user' }]);
    expect(claims.ownerOf('b1', 10)).toBeUndefined();
  });

  it('accepts a state that carries no user yet (the client sets it right after connecting)', () => {
    const out = screenAwareness([entry(10, { selection: [] })], claimant('s1', 'u1'), new AwarenessClaims());
    expect(out.accepted).toHaveLength(1);
  });

  it.each([
    ['a non-object user', { user: 'u1' }],
    ['a missing user id', { user: { name: 'Ada' } }],
    ['a non-string name', { user: { id: 'u1', name: 5 } }],
    ['an over-long name', { user: { id: 'u1', name: 'x'.repeat(MAX_PRESENCE_NAME_LENGTH + 1) } }],
    ['an over-long color', { user: { id: 'u1', color: '#'.repeat(MAX_PRESENCE_COLOR_LENGTH + 1) } }],
  ])('rejects %s', (_label, state) => {
    const out = screenAwareness([entry(10, state)], claimant('s1', 'u1'), new AwarenessClaims());
    expect(out.accepted).toEqual([]);
    expect(out.rejected[0]?.reason).toMatch(/spoofed-user|invalid-user/);
  });

  it.each([
    // Each of these crashed every peer's React app before the server checked more than user.id.
    ['a user with only its own id (no name or color)', { user: { id: 'u1' } }],
    ['a user whose name is not a string', { user: { id: 'u1', name: { toString: 1 }, color: '#0f0' } }],
  ])('rejects %s as an invalid user', (_label, state) => {
    const out = screenAwareness([entry(10, state)], claimant('s1', 'u1'), new AwarenessClaims());
    expect(out.accepted).toEqual([]);
    expect(out.rejected).toEqual([{ clientId: 10, reason: 'invalid-user' }]);
  });

  it('accepts a name and color exactly at the caps', () => {
    const state = { user: { id: 'u1', name: 'x'.repeat(MAX_PRESENCE_NAME_LENGTH), color: 'c'.repeat(MAX_PRESENCE_COLOR_LENGTH) } };
    expect(screenAwareness([entry(10, state)], claimant('s1', 'u1'), new AwarenessClaims()).accepted).toHaveLength(1);
  });
});

describe('screenAwareness: malformed states', () => {
  it.each([
    ['invalid JSON', '{"user":'],
    ['a number', '5'],
    ['an array', '[1,2]'],
    ['a string', '"hi"'],
  ])('rejects %s', (_label, state) => {
    const out = screenAwareness([entry(10, state)], claimant('s1', 'u1'), new AwarenessClaims());
    expect(out.rejected).toEqual([{ clientId: 10, reason: 'malformed-state' }]);
  });

  it.each([
    ['a selection that is not an array', me({ selection: 'x' })],
    ['a selection of non-strings', me({ selection: [{}] })],
    ['a cursor without numeric coordinates', me({ cursor: { x: 'a', y: 1 } })],
    ['a cursor that is not an object', me({ cursor: 5 })],
    ['a laser without a timestamp', me({ laser: { x: 1, y: 2 } })],
    ['a presenting state without a frame', me({ presenting: { slideIndex: 1 } })],
    ['a selection-only state with a bad selection', { selection: 'x' }],
  ])('rejects %s, even from the identified owner', (_label, state) => {
    const a = claimant('s1', 'u1');
    const claims = new AwarenessClaims();
    const out = screenAwareness([entry(10, state)], a, claims);
    expect(out.accepted).toEqual([]);
    expect(out.rejected).toEqual([{ clientId: 10, reason: 'malformed-state' }]);
    expect(claims.ownerOf('b1', 10)).toBeUndefined();
  });

  it('accepts every field the web client publishes', () => {
    const state = me({
      cursor: { x: 1, y: 2 },
      selection: ['a'],
      laser: { x: 1, y: 2, t: 3 },
      presenting: { slideIndex: 0, frameId: 'f1' },
    });
    expect(screenAwareness([entry(10, state)], claimant('s1', 'u1'), new AwarenessClaims()).rejected).toEqual([]);
  });

  it('rejects a state over the size cap', () => {
    const state = { selection: 'x'.repeat(MAX_AWARENESS_STATE_BYTES) };
    const out = screenAwareness([entry(10, state)], claimant('s1', 'u1'), new AwarenessClaims());
    expect(out.rejected).toEqual([{ clientId: 10, reason: 'state-too-large' }]);
  });
});

describe('screenAwareness: clientID ownership', () => {
  it("rejects a clientID bound to another user's live socket, which keeps it", () => {
    const claims = new AwarenessClaims();
    const victim = claimant('s1', 'victim');
    screenAwareness([entry(10, { user: { id: 'victim', name: 'N', color: '#000' } })], victim, claims);
    const out = screenAwareness([entry(10, me(), 5)], claimant('s2', 'u1'), claims);
    expect(out.rejected).toEqual([{ clientId: 10, reason: 'foreign-client' }]);
    expect(claims.ownerOf('b1', 10)).toBe(victim);
  });

  it('lets the same user take over a clientID from a stale socket (reconnect before the old one timed out)', () => {
    const claims = new AwarenessClaims();
    const stale = claimant('s1', 'u1');
    screenAwareness([entry(10, me(), 1)], stale, claims);
    const fresh = claimant('s2', 'u1');
    const out = screenAwareness([entry(10, me(), 2)], fresh, claims);
    expect(out.accepted).toHaveLength(1);
    expect(claims.ownerOf('b1', 10)).toBe(fresh);
    // The stale socket's disconnect must not broadcast a removal of the live client.
    expect(stale.claimed.has(10)).toBe(false);
    expect(stale.awareness.has(10)).toBe(false);
  });

  it('scopes claims per board', () => {
    const claims = new AwarenessClaims();
    screenAwareness([entry(10, { user: { id: 'other', name: 'N', color: '#000' } })], claimant('s1', 'other', 'b1'), claims);
    const out = screenAwareness([entry(10, me())], claimant('s2', 'u1', 'b2'), claims);
    expect(out.accepted).toHaveLength(1);
  });

  it('caps how many clientIDs one socket may bind', () => {
    const claims = new AwarenessClaims();
    const a = claimant('s1', 'u1');
    const entries = Array.from({ length: MAX_AWARENESS_CLIENTS_PER_SOCKET + 2 }, (_, i) => entry(100 + i, me()));
    const out = screenAwareness(entries, a, claims);
    expect(out.accepted).toHaveLength(MAX_AWARENESS_CLIENTS_PER_SOCKET);
    expect(out.rejected.every((r) => r.reason === 'too-many-clients')).toBe(true);
  });

  it('accepts a removal only for a clientID the socket owns', () => {
    const claims = new AwarenessClaims();
    const victim = claimant('s1', 'victim');
    screenAwareness([entry(10, { user: { id: 'victim', name: 'N', color: '#000' } })], victim, claims);
    const attacker = claimant('s2', 'u1');
    expect(screenAwareness([entry(10, 'null', 9)], attacker, claims).rejected).toEqual([
      { clientId: 10, reason: 'unowned-removal' },
    ]);
    expect(screenAwareness([entry(11, 'null', 9)], attacker, claims).rejected).toEqual([
      { clientId: 11, reason: 'unowned-removal' },
    ]);
    const own = screenAwareness([entry(10, 'null', 2)], victim, claims);
    expect(own.accepted).toHaveLength(1);
    expect(victim.awareness.has(10)).toBe(false);
  });

  it('drops only the offending entries of a mixed update', () => {
    const claims = new AwarenessClaims();
    const out = screenAwareness(
      [entry(10, me()), entry(11, { user: { id: 'victim', name: 'N', color: '#000' } }), entry(12, '[')],
      claimant('s1', 'u1'),
      claims,
    );
    expect(out.accepted.map((e) => e.clientId)).toEqual([10]);
    expect(out.rejected.map((r) => r.reason)).toEqual(['spoofed-user', 'malformed-state']);
  });

  it('frees every claim of a socket on release', () => {
    const claims = new AwarenessClaims();
    const a = claimant('s1', 'u1');
    screenAwareness([entry(10, me())], a, claims);
    claims.release(a);
    expect(claims.ownerOf('b1', 10)).toBeUndefined();
    expect(screenAwareness([entry(10, { user: { id: 'u2', name: 'N', color: '#000' } })], claimant('s2', 'u2'), claims).accepted).toHaveLength(1);
  });
});

describe('screenRemoteAwareness', () => {
  it('drops entries from other instances for clientIDs a local socket owns', () => {
    const claims = new AwarenessClaims();
    screenAwareness([entry(10, me())], claimant('s1', 'u1'), claims);
    const accepted = screenRemoteAwareness([entry(10, 'null', 9), entry(20, { user: { id: 'u2', name: 'N', color: '#000' } })], 'b1', claims);
    expect(accepted.map((e) => e.clientId)).toEqual([20]);
  });
});

describe('AwarenessClaims across instances', () => {
  const A = 'instance-a';
  const B = 'instance-b';

  function clocked() {
    let now = 1_000;
    const claims = new AwarenessClaims(() => now);
    return { claims, advance: (ms: number) => (now += ms) };
  }

  it('reports newly bound clientIDs so the gateway can announce them', () => {
    const { claims } = clocked();
    const a = claimant('s1', 'u1');
    expect(screenAwareness([entry(10, me())], a, claims).bound).toEqual([10]);
    expect(screenAwareness([entry(10, me(), 2)], a, claims).bound).toEqual([]);
  });

  it("rejects binding a clientID another user's socket owns on another instance", () => {
    const { claims } = clocked();
    claims.applyRemoteClaim('b1', A, 10, 'victim');
    const out = screenAwareness([entry(10, me())], claimant('s1', 'u1'), claims);
    expect(out.rejected).toEqual([{ clientId: 10, reason: 'foreign-client' }]);
    expect(claims.ownerOf('b1', 10)).toBeUndefined();
  });

  it('lets the same user take over their clientID from another instance', () => {
    const { claims } = clocked();
    claims.applyRemoteClaim('b1', A, 10, 'u1');
    const out = screenAwareness([entry(10, me())], claimant('s1', 'u1'), claims);
    expect(out.accepted).toHaveLength(1);
    expect(out.bound).toEqual([10]);
  });

  it("drops a remote claim only on its owning instance's release", () => {
    const { claims } = clocked();
    claims.applyRemoteClaim('b1', A, 10, 'victim');
    claims.releaseRemote('b1', B, [10]);
    expect(claims.remoteOwnerOf('b1', 10)).toEqual({ instanceId: A, userId: 'victim' });
    claims.releaseRemote('b1', A, [10]);
    expect(claims.remoteOwnerOf('b1', 10)).toBeUndefined();
  });

  it('expires remote claims nobody re-announced (a crashed instance never releases)', () => {
    const { claims, advance } = clocked();
    claims.applyRemoteClaim('b1', A, 10, 'victim');
    claims.applyRemoteClaim('b1', A, 11, 'victim');
    advance(REMOTE_CLAIM_TTL_MS - 1);
    claims.applyRemoteClaim('b1', A, 11, 'victim'); // re-announced: refreshed
    advance(2);
    expect(claims.remoteOwnerOf('b1', 10)).toBeUndefined();
    expect(claims.remoteOwnerOf('b1', 11)).toBeDefined();
    claims.sweepRemote();
    expect(screenAwareness([entry(10, me())], claimant('s1', 'u1'), claims).accepted).toHaveLength(1);
  });

  it('refreshes well within the TTL', () => {
    expect(CLAIM_REFRESH_INTERVAL_MS * 2).toBeLessThan(REMOTE_CLAIM_TTL_MS);
  });

  it('yields a local claim when the same user claims it from another instance', () => {
    const { claims } = clocked();
    const stale = claimant('s1', 'u1');
    screenAwareness([entry(10, me())], stale, claims);
    expect(claims.applyRemoteClaim('b1', A, 10, 'u1')).toBe('accepted');
    expect(claims.ownerOf('b1', 10)).toBeUndefined();
    expect(stale.claimed.has(10)).toBe(false);
    // The stale socket's disconnect must not broadcast a removal for it.
    expect(stale.awareness.has(10)).toBe(false);
  });

  it("keeps a local claim when another user's instance claims the same clientID", () => {
    const { claims } = clocked();
    const owner = claimant('s1', 'u1');
    screenAwareness([entry(10, me())], owner, claims);
    expect(claims.applyRemoteClaim('b1', A, 10, 'attacker')).toBe('conflict');
    expect(claims.ownerOf('b1', 10)).toBe(owner);
  });

  it('releases a clientID whose owner announced its removal, and reports it', () => {
    const { claims } = clocked();
    const a = claimant('s1', 'u1');
    screenAwareness([entry(10, me())], a, claims);
    const out = screenAwareness([entry(10, 'null', 2)], a, claims);
    expect(out.released).toEqual([10]);
    expect(claims.ownerOf('b1', 10)).toBeUndefined();
  });

  it('returns what a disconnecting socket released', () => {
    const { claims } = clocked();
    const a = claimant('s1', 'u1');
    screenAwareness([entry(10, me()), entry(11, me())], a, claims);
    expect(claims.release(a).sort()).toEqual([10, 11]);
  });

  it("lists a board's local claims for re-announcement", () => {
    const { claims } = clocked();
    screenAwareness([entry(10, me())], claimant('s1', 'u1'), claims);
    screenAwareness([entry(20, { user: { id: 'u2', name: 'N', color: '#000' } })], claimant('s2', 'u2'), claims);
    screenAwareness([entry(30, me())], claimant('s3', 'u1', 'b2'), claims);
    expect(claims.localClaimsOf('b1')).toEqual([
      { clientId: 10, userId: 'u1' },
      { clientId: 20, userId: 'u2' },
    ]);
  });

  it('forgets remote claims for a board no longer live here', () => {
    const { claims } = clocked();
    claims.applyRemoteClaim('b1', A, 10, 'victim');
    claims.applyRemoteClaim('b2', A, 10, 'victim');
    claims.dropRemoteBoard('b1');
    expect(claims.remoteOwnerOf('b1', 10)).toBeUndefined();
    expect(claims.remoteOwnerOf('b2', 10)).toBeDefined();
  });
});
