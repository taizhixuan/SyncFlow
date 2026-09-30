import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import type { CanvasElement } from '@syncflow/shared';
import { addElements, updateElements, type Command } from '../model/commands';
import { addVote, toggleReaction } from '../model/voting';
import { addTag, removeTag } from '../model/tags';
import { createYDoc, toPlainDoc, applyCommandToY, LOCAL_ORIGIN, type YElements } from './yjs-doc';

function rect(id: string, extra: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id, type: 'rect', x: 0, y: 0, width: 10, height: 10, zIndex: 1, rotation: 0, opacity: 1,
    stroke: 'auto', fill: null, strokeWidth: 2, strokeStyle: 'solid', ...extra,
  };
}

type Peer = ReturnType<typeof createYDoc>;

function pair(seed: CanvasElement): [Peer, Peer] {
  const A = createYDoc();
  const B = createYDoc();
  applyCommandToY(A.ydoc, A.elements, addElements([seed]), LOCAL_ORIGIN);
  Y.applyUpdate(B.ydoc, Y.encodeStateAsUpdate(A.ydoc));
  return [A, B];
}

function exchange(A: Peer, B: Peer): void {
  Y.applyUpdate(A.ydoc, Y.encodeStateAsUpdate(B.ydoc));
  Y.applyUpdate(B.ydoc, Y.encodeStateAsUpdate(A.ydoc));
}

/** Same read-modify-write the store performs: compute from the projection, dispatch. */
function edit(p: Peer, id: string, fn: (el: CanvasElement) => Partial<CanvasElement>): void {
  const el = toPlainDoc(p.elements).elements[id]!;
  const cmd: Command = updateElements({ [id]: fn(el) });
  applyCommandToY(p.ydoc, p.elements, cmd, LOCAL_ORIGIN);
}

const el = (p: Peer, id = 'a'): CanvasElement => toPlainDoc(p.elements).elements[id]!;

/** Write a legacy (pre-migration) board: collab fields as whole plain values. */
function legacy(elements: YElements, ydoc: Y.Doc, value: CanvasElement): void {
  ydoc.transact(() => {
    const inner = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(value)) inner.set(k, v);
    elements.set(value.id, inner);
  });
}

describe('collab fields merge per user under concurrency', () => {
  it('keeps both users’ first votes on a never-voted element', () => {
    const [A, B] = pair(rect('a'));
    edit(A, 'a', (e) => ({ votes: addVote(e.votes ?? {}, 'alice', 1) }));
    edit(B, 'a', (e) => ({ votes: addVote(e.votes ?? {}, 'bob', 2) }));
    exchange(A, B);
    expect(el(A).votes).toEqual({ alice: 1, bob: 2 });
    expect(el(B).votes).toEqual({ alice: 1, bob: 2 });
  });

  it('keeps concurrent reactions on the same emoji', () => {
    const [A, B] = pair(rect('a'));
    edit(A, 'a', (e) => ({ reactions: toggleReaction(e.reactions ?? {}, '👍', 'alice') }));
    edit(B, 'a', (e) => ({ reactions: toggleReaction(e.reactions ?? {}, '👍', 'bob') }));
    exchange(A, B);
    expect([...(el(A).reactions?.['👍'] ?? [])].sort()).toEqual(['alice', 'bob']);
    expect(el(B).reactions).toEqual(el(A).reactions);
  });

  it('a removal by one user does not drop another user’s concurrent reaction', () => {
    const [A, B] = pair(rect('a', { reactions: { '👍': ['alice'] } }));
    edit(A, 'a', (e) => ({ reactions: toggleReaction(e.reactions ?? {}, '👍', 'alice') }));
    edit(B, 'a', (e) => ({ reactions: toggleReaction(e.reactions ?? {}, '👍', 'bob') }));
    exchange(A, B);
    expect(el(A).reactions).toEqual({ '👍': ['bob'] });
    expect(el(B).reactions).toEqual({ '👍': ['bob'] });
  });

  it('keeps concurrent tag additions and removals', () => {
    const [A, B] = pair(rect('a', { tags: ['keep', 'drop'] }));
    edit(A, 'a', (e) => ({ tags: addTag(e.tags ?? [], 'alpha') }));
    edit(B, 'a', (e) => ({ tags: removeTag(addTag(e.tags ?? [], 'beta'), 'drop') }));
    exchange(A, B);
    expect([...(el(A).tags ?? [])].sort()).toEqual(['alpha', 'beta', 'keep']);
    expect(el(B).tags).toEqual(el(A).tags);
  });

  it('reads legacy plain values and migrates on first write', () => {
    const { ydoc, elements } = createYDoc();
    legacy(elements, ydoc, rect('a', { votes: { alice: 2 }, reactions: { '🎉': ['alice'] }, tags: ['x'] }));
    const before = toPlainDoc(elements).elements.a!;
    expect(before.votes).toEqual({ alice: 2 });
    expect(before.reactions).toEqual({ '🎉': ['alice'] });
    expect(before.tags).toEqual(['x']);

    applyCommandToY(ydoc, elements, updateElements({ a: { votes: { alice: 2, bob: 1 } } }), LOCAL_ORIGIN);
    const inner = elements.get('a')!;
    expect(inner.has('votes')).toBe(false); // migrated off the whole-value field
    expect(toPlainDoc(elements).elements.a!.votes).toEqual({ alice: 2, bob: 1 });
    expect(toPlainDoc(elements).elements.a!.tags).toEqual(['x']); // untouched field unchanged
  });

  it('merges a legacy-migrated vote with a peer’s concurrent vote', () => {
    const A = createYDoc();
    const B = createYDoc();
    legacy(A.elements, A.ydoc, rect('a', { votes: { carol: 1 } }));
    Y.applyUpdate(B.ydoc, Y.encodeStateAsUpdate(A.ydoc));
    edit(A, 'a', (e) => ({ votes: addVote(e.votes ?? {}, 'alice', 1) }));
    edit(B, 'a', (e) => ({ votes: addVote(e.votes ?? {}, 'bob', 1) }));
    exchange(A, B);
    expect(el(A).votes).toEqual({ carol: 1, alice: 1, bob: 1 });
    expect(el(B).votes).toEqual(el(A).votes);
  });

  it('a vote toggle is a single undo step that only reverts that user', () => {
    const [A, B] = pair(rect('a'));
    const um = new Y.UndoManager(A.elements, { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 0 });
    edit(B, 'a', (e) => ({ votes: addVote(e.votes ?? {}, 'bob', 1) }));
    edit(A, 'a', (e) => ({ votes: addVote(e.votes ?? {}, 'alice', 1) }));
    exchange(A, B);
    um.undo();
    expect(el(A).votes).toEqual({ bob: 1 });
    expect(um.undoStack.length).toBe(0);
  });

  it('keeps referential identity for unchanged elements with collab fields', () => {
    const { ydoc, elements } = createYDoc();
    applyCommandToY(ydoc, elements, addElements([rect('a', { votes: { u: 1 }, tags: ['t'] }), rect('b')]), LOCAL_ORIGIN);
    const first = toPlainDoc(elements);
    applyCommandToY(ydoc, elements, updateElements({ b: { x: 5 } }), LOCAL_ORIGIN);
    const second = toPlainDoc(elements, first);
    expect(second.elements.a).toBe(first.elements.a);
  });
});

describe('projection validates what peers wrote', () => {
  it('drops a malformed element and warns once per id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ydoc, elements } = createYDoc();
    applyCommandToY(ydoc, elements, addElements([rect('ok')]), LOCAL_ORIGIN);
    legacy(elements, ydoc, { ...rect('evil-points'), points: 'x' } as unknown as CanvasElement);
    const first = toPlainDoc(elements);
    expect(Object.keys(first.elements)).toEqual(['ok']);
    toPlainDoc(elements, first);
    toPlainDoc(elements);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('evil-points'))).toHaveLength(1);
    warn.mockRestore();
  });

  it('a command never deletes or rewrites an element it could not read', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ydoc, elements } = createYDoc();
    legacy(elements, ydoc, { ...rect('evil2'), x: 'nope' } as unknown as CanvasElement);
    applyCommandToY(ydoc, elements, addElements([rect('b')]), LOCAL_ORIGIN);
    expect(elements.get('evil2')?.get('x')).toBe('nope');
    warn.mockRestore();
  });
});
