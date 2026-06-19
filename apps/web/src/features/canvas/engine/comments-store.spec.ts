/**
 * TDD: tests for the comments slice on CanvasStore.
 * Written BEFORE implementation — these tests define the contract.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { addElements } from '../model/commands';
import { createCanvasStore } from './canvas-store';

const rect = {
  id: 'a',
  type: 'rect' as const,
  x: 0,
  y: 0,
  rotation: 0,
  opacity: 1,
  zIndex: 0,
  fill: null,
  stroke: 'auto',
  strokeWidth: 2,
  strokeStyle: 'solid' as const,
};

describe('canvas store — comments slice', () => {
  beforeEach(() => localStorage.clear());

  it('starts with no comments', () => {
    const store = createCanvasStore('local');
    expect(store.getState().comments).toEqual([]);
  });

  it('addComment (element-pinned) returns an id and projects a comment', () => {
    const store = createCanvasStore('local');
    const id = store.getState().addComment({
      elementId: 'el-1',
      body: 'Nice shape',
      author: { id: 'u1', name: 'Alice' },
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    const comments = store.getState().comments;
    expect(comments).toHaveLength(1);
    const c = comments[0]!;
    expect(c.id).toBe(id);
    expect(c.elementId).toBe('el-1');
    expect(c.authorId).toBe('u1');
    expect(c.authorName).toBe('Alice');
    expect(c.body).toBe('Nice shape');
    expect(c.resolved).toBe(false);
    expect(c.replies).toEqual([]);
    expect(typeof c.createdAt).toBe('number');
  });

  it('addComment (board-point) sets point, not elementId', () => {
    const store = createCanvasStore('local');
    const id = store.getState().addComment({
      point: { x: 50, y: 100 },
      body: 'Here',
      author: { id: 'u2', name: 'Bob' },
    });
    const c = store.getState().comments.find((x) => x.id === id)!;
    expect(c.point).toEqual({ x: 50, y: 100 });
    expect(c.elementId).toBeUndefined();
  });

  it('replyToComment appends a reply and updates the comment', () => {
    const store = createCanvasStore('local');
    const cid = store.getState().addComment({
      elementId: 'el-2',
      body: 'Question here',
      author: { id: 'u1', name: 'Alice' },
    });
    store.getState().replyToComment(cid, { body: 'Great point', author: { id: 'u2', name: 'Bob' } });
    const c = store.getState().comments.find((x) => x.id === cid)!;
    expect(c.replies).toHaveLength(1);
    const reply = c.replies[0]!;
    expect(reply.body).toBe('Great point');
    expect(reply.authorId).toBe('u2');
    expect(reply.authorName).toBe('Bob');
    expect(typeof reply.id).toBe('string');
  });

  it('resolveComment sets resolved=true, reopening sets resolved=false', () => {
    const store = createCanvasStore('local');
    const cid = store.getState().addComment({
      elementId: 'el-3',
      body: 'To do',
      author: { id: 'u1', name: 'Alice' },
    });
    store.getState().resolveComment(cid, true);
    expect(store.getState().comments.find((c) => c.id === cid)!.resolved).toBe(true);
    store.getState().resolveComment(cid, false);
    expect(store.getState().comments.find((c) => c.id === cid)!.resolved).toBe(false);
  });

  it('deleteComment removes the comment', () => {
    const store = createCanvasStore('local');
    const cid = store.getState().addComment({
      elementId: 'el-4',
      body: 'Delete me',
      author: { id: 'u1', name: 'Alice' },
    });
    expect(store.getState().comments).toHaveLength(1);
    store.getState().deleteComment(cid);
    expect(store.getState().comments).toHaveLength(0);
  });

  it('comment mutations do NOT affect element undo/redo', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect]));
    // Add a comment
    store.getState().addComment({ elementId: 'a', body: 'test', author: { id: 'u1', name: 'Alice' } });
    expect(store.getState().comments).toHaveLength(1);
    // Undo the element add — should NOT undo the comment
    store.getState().undo();
    expect(Object.keys(store.getState().doc.elements)).toEqual([]);
    // Comment survives the element undo
    expect(store.getState().comments).toHaveLength(1);
  });

  it('comments are projected in createdAt order (ascending)', () => {
    const store = createCanvasStore('local');
    const s = store.getState();
    const id1 = s.addComment({ point: { x: 0, y: 0 }, body: 'First', author: { id: 'u1', name: 'A' } });
    const id2 = s.addComment({ point: { x: 1, y: 0 }, body: 'Second', author: { id: 'u1', name: 'A' } });
    const ids = store.getState().comments.map((c) => c.id);
    expect(ids.indexOf(id1)).toBeLessThan(ids.indexOf(id2));
  });
});
