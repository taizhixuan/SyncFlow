import type { RawAwarenessEntry } from './awareness-codec';

/**
 * Any member, viewers included, may relay awareness, and peers render whatever
 * identity a state claims. Without these checks one member could draw a cursor
 * under someone else's name, overwrite or remove another client's presence by
 * reusing its clientID, or push arbitrarily large states to every peer.
 */

/** A selection of a few thousand element ids fits comfortably; a cursor state is ~100 bytes. */
export const MAX_AWARENESS_STATE_BYTES = 64 * 1024;
/** Display names are shown on cursor labels and avatars; longer ones only serve to deface them. */
export const MAX_PRESENCE_NAME_LENGTH = 100;
/** Enough for any CSS color notation, including hsl()/rgb() with spaces. */
export const MAX_PRESENCE_COLOR_LENGTH = 32;
/**
 * A socket normally speaks for exactly one clientID (its doc's). Yjs may pick a
 * new one after a clientID collision, so allow a few, but not an unbounded set.
 */
export const MAX_AWARENESS_CLIENTS_PER_SOCKET = 4;

export type AwarenessRejection =
  | 'malformed-state'
  | 'state-too-large'
  | 'spoofed-user'
  | 'invalid-user'
  | 'foreign-client'
  | 'unowned-removal'
  | 'too-many-clients';

/** The socket-side view the guard needs (the gateway's per-socket state satisfies it). */
export interface AwarenessClaimant {
  socketId: string;
  userId: string;
  boardId: string;
  /** clientIDs bound to this socket. */
  claimed: Set<number>;
  /** clientID -> last clock announced with a non-null state (for ghost-cursor cleanup). */
  awareness: Map<number, number>;
}

/**
 * Other instances re-announce their claims this often, so a remote claim that
 * goes this long without one belongs to an instance that crashed (and so never
 * sent its releases). Three missed refreshes before it lapses.
 */
export const CLAIM_REFRESH_INTERVAL_MS = 20_000;
export const REMOTE_CLAIM_TTL_MS = 3 * CLAIM_REFRESH_INTERVAL_MS;

export interface ScreenResult {
  accepted: RawAwarenessEntry[];
  rejected: Array<{ clientId: number; reason: AwarenessRejection }>;
  /** clientIDs newly bound to the socket: announce them to other instances. */
  bound: number[];
  /** clientIDs the socket gave up (it announced their removal): release them. */
  released: number[];
}

interface RemoteClaim {
  instanceId: string;
  userId: string;
  expiresAt: number;
}

/**
 * Which socket owns each awareness clientID, per board: our own sockets
 * (authoritative) plus what other instances announced over Redis.
 */
export class AwarenessClaims {
  private readonly owners = new Map<string, AwarenessClaimant>();
  private readonly remote = new Map<string, RemoteClaim>();

  constructor(private readonly now: () => number = Date.now) {}

  ownerOf(boardId: string, clientId: number): AwarenessClaimant | undefined {
    return this.owners.get(key(boardId, clientId));
  }

  /** Bind `clientId` to `claimant`, taking it from `previous` if given. */
  bind(claimant: AwarenessClaimant, clientId: number, previous?: AwarenessClaimant): void {
    if (previous) forget(previous, clientId);
    claimant.claimed.add(clientId);
    this.owners.set(key(claimant.boardId, clientId), claimant);
  }

  unbind(claimant: AwarenessClaimant, clientId: number): void {
    const k = key(claimant.boardId, clientId);
    if (this.owners.get(k) === claimant) this.owners.delete(k);
    claimant.claimed.delete(clientId);
  }

  /** The socket is gone: its clientIDs are free for whoever comes next. Returns them. */
  release(claimant: AwarenessClaimant): number[] {
    const released = Array.from(claimant.claimed);
    for (const clientId of released) this.unbind(claimant, clientId);
    return released;
  }

  /** Boards on which our sockets own at least one clientID. */
  localBoards(): string[] {
    return Array.from(new Set(Array.from(this.owners.values(), (owner) => owner.boardId)));
  }

  /** Every clientID our sockets own on the board, for re-announcing to other instances. */
  localClaimsOf(boardId: string): Array<{ clientId: number; userId: string }> {
    const out: Array<{ clientId: number; userId: string }> = [];
    for (const [k, owner] of this.owners) {
      if (owner.boardId !== boardId) continue;
      out.push({ clientId: Number(k.slice(k.lastIndexOf('\n') + 1)), userId: owner.userId });
    }
    return out.sort((a, b) => a.clientId - b.clientId);
  }

  /**
   * Record (or refresh) another instance's claim. When one of our sockets owns
   * the clientID: the same user moved the client to that instance, so ours is
   * stale and yields (without its disconnect later broadcasting a removal of
   * the live client); a different user is a conflict and ours stands.
   */
  applyRemoteClaim(boardId: string, instanceId: string, clientId: number, userId: string): 'accepted' | 'conflict' {
    const k = key(boardId, clientId);
    const local = this.owners.get(k);
    if (local) {
      if (local.userId !== userId) return 'conflict';
      this.owners.delete(k);
      forget(local, clientId);
    }
    this.remote.set(k, { instanceId, userId, expiresAt: this.now() + REMOTE_CLAIM_TTL_MS });
    return 'accepted';
  }

  /** Only the instance holding a claim may release it. */
  releaseRemote(boardId: string, instanceId: string, clientIds: number[]): void {
    for (const clientId of clientIds) {
      const k = key(boardId, clientId);
      if (this.remote.get(k)?.instanceId === instanceId) this.remote.delete(k);
    }
  }

  remoteOwnerOf(boardId: string, clientId: number): { instanceId: string; userId: string } | undefined {
    const k = key(boardId, clientId);
    const claim = this.remote.get(k);
    if (!claim) return undefined;
    if (claim.expiresAt <= this.now()) {
      this.remote.delete(k);
      return undefined;
    }
    return { instanceId: claim.instanceId, userId: claim.userId };
  }

  /** Drop lapsed remote claims (lookups ignore them anyway; this bounds memory). */
  sweepRemote(): void {
    const now = this.now();
    for (const [k, claim] of this.remote) if (claim.expiresAt <= now) this.remote.delete(k);
  }

  /** No socket here holds the board any more, and we stop hearing its releases. */
  dropRemoteBoard(boardId: string): void {
    const prefix = `${boardId}\n`;
    for (const k of this.remote.keys()) if (k.startsWith(prefix)) this.remote.delete(k);
  }
}

function forget(claimant: AwarenessClaimant, clientId: number): void {
  claimant.claimed.delete(clientId);
  claimant.awareness.delete(clientId);
}

function key(boardId: string, clientId: number): string {
  return `${boardId}\n${clientId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShortString(value: unknown, max: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= max);
}

type StateVerdict = 'removal' | 'state' | 'malformed-state' | 'state-too-large' | 'spoofed-user' | 'invalid-user';

function inspectState(raw: string, userId: string): StateVerdict {
  if (Buffer.byteLength(raw, 'utf8') > MAX_AWARENESS_STATE_BYTES) return 'state-too-large';
  let state: unknown;
  try {
    state = JSON.parse(raw);
  } catch {
    return 'malformed-state';
  }
  if (state === null) return 'removal';
  if (!isRecord(state)) return 'malformed-state';
  // No user (yet): peers do not render such a state, so it cannot impersonate.
  const user = state.user;
  if (user === undefined || user === null) return 'state';
  if (!isRecord(user)) return 'invalid-user';
  if (user.id !== userId) return 'spoofed-user';
  if (!isShortString(user.name, MAX_PRESENCE_NAME_LENGTH)) return 'invalid-user';
  if (!isShortString(user.color, MAX_PRESENCE_COLOR_LENGTH)) return 'invalid-user';
  return 'state';
}

/**
 * Keep the entries `claimant` may publish, binding newly used clientIDs to it
 * and tracking what it announced. A clientID owned by another user's live
 * socket is refused. One owned by another socket of the SAME user is taken
 * over: that is a client reconnecting before the server noticed its old socket
 * died, and a user cannot impersonate themselves.
 */
export function screenAwareness(
  entries: RawAwarenessEntry[],
  claimant: AwarenessClaimant,
  claims: AwarenessClaims,
): ScreenResult {
  const result: ScreenResult = { accepted: [], rejected: [], bound: [], released: [] };
  const reject = (clientId: number, reason: AwarenessRejection): void => {
    result.rejected.push({ clientId, reason });
  };
  for (const entry of entries) {
    const verdict = inspectState(entry.state, claimant.userId);
    const owner = claims.ownerOf(claimant.boardId, entry.clientId);
    if (verdict === 'removal') {
      if (owner !== claimant) {
        reject(entry.clientId, 'unowned-removal');
        continue;
      }
      claimant.awareness.delete(entry.clientId);
      claims.unbind(claimant, entry.clientId);
      result.released.push(entry.clientId);
      result.accepted.push(entry);
      continue;
    }
    if (verdict !== 'state') {
      reject(entry.clientId, verdict);
      continue;
    }
    if (owner !== claimant) {
      // Held here or on another instance; either way only the same user may take it.
      const holder = owner ?? claims.remoteOwnerOf(claimant.boardId, entry.clientId);
      if (holder && holder.userId !== claimant.userId) {
        reject(entry.clientId, 'foreign-client');
        continue;
      }
      if (claimant.claimed.size >= MAX_AWARENESS_CLIENTS_PER_SOCKET) {
        reject(entry.clientId, 'too-many-clients');
        continue;
      }
      claims.bind(claimant, entry.clientId, owner);
      result.bound.push(entry.clientId);
    }
    claimant.awareness.set(entry.clientId, entry.clock);
    result.accepted.push(entry);
  }
  return result;
}

/**
 * Entries relayed from another instance were screened there, but that instance
 * cannot see our sockets' claims. A local socket is the authority for its own
 * clientIDs, so drop remote entries for them — e.g. the stale removal another
 * instance broadcasts when a client that has since reconnected here times out.
 */
export function screenRemoteAwareness(
  entries: RawAwarenessEntry[],
  boardId: string,
  claims: AwarenessClaims,
): RawAwarenessEntry[] {
  return entries.filter((entry) => claims.ownerOf(boardId, entry.clientId) === undefined);
}
