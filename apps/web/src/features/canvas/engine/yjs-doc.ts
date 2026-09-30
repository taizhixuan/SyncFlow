import * as Y from 'yjs';
import { canvasElementSchema, type CanvasElement } from '@syncflow/shared';
import { type Command, type Doc, emptyDoc } from '../model/commands';

/** Local edits: tracked by UndoManager and sent to the network. */
export const LOCAL_ORIGIN = Symbol('local');
/** Remote edits: not tracked, not re-broadcast. */
export const REMOTE_ORIGIN = Symbol('remote');

export type YElements = Y.Map<Y.Map<unknown>>;

export function createYDoc(): { ydoc: Y.Doc; elements: YElements } {
  const ydoc = new Y.Doc();
  const elements = ydoc.getMap<Y.Map<unknown>>('elements');
  return { ydoc, elements };
}

// ─── Collaborative fields ────────────────────────────────────────────────────
//
// `votes`, `reactions` and `tags` are edited by many people at once. Stored as
// one whole value per field, two concurrent votes are two writes to the same
// key and last-writer-wins silently drops one of them. So each vote, reaction
// and tag gets its OWN key directly on the element's inner Y.Map, and a toggle
// only ever touches that key.
//
// Flat prefixed keys rather than nested Y.Maps on purpose: a nested map has to
// be created by whoever writes first, and two peers creating it concurrently is
// the same whole-value race one level down — one peer's map (and its vote)
// loses. The element's inner map already exists, so flat keys never race on
// creation. They also survive the server's restore-reconcile, which copies
// inner-map keys as plain JSON values.
//
// Boards persisted before this change hold the whole-value field. Reads accept
// both; the first local write to a field moves it to per-key form.

const COLLAB_FIELDS = new Set(['votes', 'reactions', 'tags']);
const VOTE = 'vote:';
const REACT = 'react:';
const TAG = 'tag:';

function isCollabKey(key: string): boolean {
  return key.startsWith(VOTE) || key.startsWith(REACT) || key.startsWith(TAG);
}

function reactKey(emoji: string, userId: string): string {
  // JSON keeps the pair unambiguous whatever characters the emoji or id carry.
  return REACT + JSON.stringify([emoji, userId]);
}

function parseReactKey(key: string): [string, string] | null {
  try {
    const pair: unknown = JSON.parse(key.slice(REACT.length));
    if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && typeof pair[1] === 'string') {
      return [pair[0], pair[1]];
    }
  } catch {
    // Malformed key from a peer — ignored like any other invalid entry.
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface Collab {
  votes: Record<string, number>;
  /** emoji → set of user ids */
  reactions: Map<string, Set<string>>;
  /** tag → sort order */
  tags: Map<string, number>;
  hasVotes: boolean;
  hasReactions: boolean;
  hasTags: boolean;
}

/** Gather the collab fields from a raw inner-map snapshot (legacy + per-key). */
function readCollab(raw: Record<string, unknown>): Collab {
  const c: Collab = {
    votes: {},
    reactions: new Map(),
    tags: new Map(),
    hasVotes: false,
    hasReactions: false,
    hasTags: false,
  };
  const legacyVotes = raw.votes;
  if (isRecord(legacyVotes)) {
    c.hasVotes = true;
    for (const [u, n] of Object.entries(legacyVotes)) {
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) c.votes[u] = n;
    }
  }
  const legacyReactions = raw.reactions;
  if (isRecord(legacyReactions)) {
    c.hasReactions = true;
    for (const [emoji, users] of Object.entries(legacyReactions)) {
      if (!Array.isArray(users)) continue;
      for (const u of users) {
        if (typeof u !== 'string') continue;
        const set = c.reactions.get(emoji) ?? new Set<string>();
        set.add(u);
        c.reactions.set(emoji, set);
      }
    }
  }
  const legacyTags = raw.tags;
  if (Array.isArray(legacyTags)) {
    c.hasTags = true;
    legacyTags.forEach((t, i) => {
      if (typeof t === 'string' && !c.tags.has(t)) c.tags.set(t, i);
    });
  }
  for (const [key, v] of Object.entries(raw)) {
    if (key.startsWith(VOTE)) {
      c.hasVotes = true;
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) c.votes[key.slice(VOTE.length)] = v;
    } else if (key.startsWith(REACT)) {
      c.hasReactions = true;
      const pair = parseReactKey(key);
      if (!pair || v !== true) continue;
      const set = c.reactions.get(pair[0]) ?? new Set<string>();
      set.add(pair[1]);
      c.reactions.set(pair[0], set);
    } else if (key.startsWith(TAG)) {
      c.hasTags = true;
      if (typeof v === 'number' && Number.isFinite(v)) c.tags.set(key.slice(TAG.length), v);
    }
  }
  return c;
}

/** Fold a raw inner-map snapshot into the plain element shape the UI reads. */
function foldElement(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(raw)) {
    if (!COLLAB_FIELDS.has(key) && !isCollabKey(key)) out[key] = v;
  }
  const c = readCollab(raw);
  if (c.hasVotes && Object.keys(c.votes).length > 0) out.votes = c.votes;
  if (c.hasReactions) {
    const reactions: Record<string, string[]> = {};
    for (const [emoji, users] of c.reactions) {
      // Sorted so every peer projects the same array regardless of the order
      // the per-user keys happened to arrive in.
      if (users.size > 0) reactions[emoji] = [...users].sort();
    }
    if (Object.keys(reactions).length > 0) out.reactions = reactions;
  }
  if (c.hasTags) {
    out.tags = [...c.tags.entries()]
      .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([t]) => t);
  }
  return out;
}

/** Write the per-key form of the collab fields; migrates legacy whole values. */
function writeCollab(inner: Y.Map<unknown>, next: Record<string, unknown>): void {
  const raw = inner.toJSON() as Record<string, unknown>;
  const current = readCollab(raw);

  // votes
  {
    const legacy = inner.has('votes');
    const desired = isRecord(next.votes) ? next.votes : {};
    for (const key of Object.keys(raw)) {
      if (!key.startsWith(VOTE)) continue;
      const n = desired[key.slice(VOTE.length)];
      if (typeof n !== 'number' || n <= 0) inner.delete(key);
    }
    for (const [u, n] of Object.entries(desired)) {
      if (typeof n !== 'number' || n <= 0) continue;
      if (legacy || raw[VOTE + u] !== n) inner.set(VOTE + u, n);
    }
    if (legacy) inner.delete('votes');
  }

  // reactions
  {
    const legacy = inner.has('reactions');
    const desired = new Set<string>();
    if (isRecord(next.reactions)) {
      for (const [emoji, users] of Object.entries(next.reactions)) {
        if (!Array.isArray(users)) continue;
        for (const u of users) if (typeof u === 'string') desired.add(reactKey(emoji, u));
      }
    }
    for (const key of Object.keys(raw)) {
      if (key.startsWith(REACT) && !desired.has(key)) inner.delete(key);
    }
    for (const key of desired) {
      if (legacy || raw[key] !== true) inner.set(key, true);
    }
    if (legacy) inner.delete('reactions');
  }

  // tags
  {
    const legacy = inner.has('tags');
    const desired = Array.isArray(next.tags) ? next.tags.filter((t): t is string => typeof t === 'string') : [];
    const want = new Set(desired);
    for (const key of Object.keys(raw)) {
      if (key.startsWith(TAG) && !want.has(key.slice(TAG.length))) inner.delete(key);
    }
    if (legacy) {
      desired.forEach((t, i) => inner.set(TAG + t, i));
      inner.delete('tags');
    } else {
      let order = Math.max(-1, ...current.tags.values());
      for (const t of desired) {
        if (!(TAG + t in raw)) inner.set(TAG + t, ++order);
      }
    }
  }
}

// ─── Projection ──────────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Field-by-field identity check between two consecutive projections.
 *
 * A shallow `===` sweep suffices for ordinary fields: `Y.Map.toJSON` returns
 * non-Yjs values by reference, so an untouched array (freehand `points`,
 * connector `from`/`to`) is the same object on every projection. The collab
 * fields are rebuilt from per-key entries each time, so they compare by value.
 */
function sameElement(a: CanvasElement, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  const ra = a as unknown as Record<string, unknown>;
  for (const k of ka) {
    if (COLLAB_FIELDS.has(k) ? !deepEqual(ra[k], b[k]) : ra[k] !== b[k]) return false;
  }
  return true;
}

const warnedInvalid = new Set<string>();

/**
 * Validate an element read from Yjs. Anything in the doc may have come from a
 * peer, and a malformed shape (say `points: "x"`) would crash rendering for
 * every viewer — so invalid entries are dropped from the projection and logged
 * once per id rather than on every frame.
 */
export function isValidElement(id: string, raw: unknown): raw is CanvasElement {
  const res = canvasElementSchema.safeParse(raw);
  if (res.success && res.data.id === id) return true;
  if (!warnedInvalid.has(id)) {
    warnedInvalid.add(id);
    console.warn(`[canvas] dropping invalid element "${id}" from the projection`, res.error?.issues ?? 'id mismatch');
  }
  return false;
}

/**
 * Project the Yjs element map into a plain document.
 *
 * Pass the previous projection as `prev` and every element whose fields are
 * unchanged is returned as the SAME object it was last time. That referential
 * stability is what lets React skip work: this runs once per pointer-move
 * during a draw or drag, and without it every element gets a fresh object,
 * every memo comparison fails, and all N shapes re-render to move one. It also
 * means only changed elements pay for schema validation.
 */
export function toPlainDoc(elements: YElements, prev?: Doc): Doc {
  const doc = emptyDoc();
  elements.forEach((inner, id) => {
    if (!(inner instanceof Y.Map)) {
      isValidElement(id, inner);
      return;
    }
    const next = foldElement(inner.toJSON() as Record<string, unknown>);
    const before = prev?.elements[id];
    if (before !== undefined && sameElement(before, next)) {
      doc.elements[id] = before;
      return;
    }
    if (isValidElement(id, next)) doc.elements[id] = next;
  });
  return doc;
}

/** Structural equality so compound fields (arrays/ref objects) don't re-set spuriously. */
function fieldEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Write one element's fields into its inner map, touching only differences.
 * Compound fields (freehand `points`, connector `from`/`to`) are stored as
 * whole values and merge last-writer-wins per field; the collab fields are
 * written per user/item (see above).
 */
function writeElement(elements: YElements, el: CanvasElement): void {
  let inner = elements.get(el.id);
  if (!inner) {
    inner = new Y.Map<unknown>();
    elements.set(el.id, inner);
  }
  const next = el as unknown as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    if (COLLAB_FIELDS.has(key)) continue;
    if (!fieldEquals(inner.get(key), next[key])) inner.set(key, next[key]);
  }
  for (const key of Array.from(inner.keys())) {
    if (COLLAB_FIELDS.has(key) || isCollabKey(key)) continue;
    if (!(key in next)) inner.delete(key);
  }
  writeCollab(inner, next);
}

/**
 * Translate a pure Command into Yjs writes by diffing the projected doc
 * before/after the command. Keeps commands.ts untouched and preserves
 * field-level merge (only changed fields are set).
 */
export function applyCommandToY(
  ydoc: Y.Doc,
  elements: YElements,
  cmd: Command,
  origin: unknown,
): void {
  const before = toPlainDoc(elements);
  const after = cmd.apply(before);
  ydoc.transact(() => {
    for (const id of Object.keys(before.elements)) {
      if (!(id in after.elements)) elements.delete(id);
    }
    for (const id of Object.keys(after.elements)) {
      const el = after.elements[id];
      // Unchanged elements keep their object identity through a command, so
      // skipping them avoids re-reading every inner map on every dispatch.
      if (el && el !== before.elements[id]) writeElement(elements, el);
    }
  }, origin);
}
