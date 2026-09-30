import { beforeEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import type { CanvasElement } from '@syncflow/shared';
import { addElements, updateElements } from '../model/commands';
import { createCanvasStore } from './canvas-store';

const rect = (id: string): CanvasElement =>
  ({
    id,
    type: 'rect',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
  }) as CanvasElement;

const author = { id: 'u1', name: 'Viewer' };

// The server drops every doc update from a viewer. Any local write would render
// for the viewer only and never reach peers, so the board silently diverges.
describe('canvas store read-only (viewer) mode', () => {
  beforeEach(() => localStorage.clear());

  it('produces no local Yjs update from any mutating action', () => {
    const store = createCanvasStore('board-ro');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setSelected(['a']);
    const commentId = store.getState().addComment({ point: { x: 0, y: 0 }, body: 'hi', author })!;
    store.getState().setReadOnly(true);

    let localUpdates = 0;
    store.getState().ydoc.on('update', () => (localUpdates += 1));
    const s = store.getState();
    s.dispatch(updateElements({ a: { x: 99 } }));
    s.recolorSelection({ stroke: '#FF5A5F' });
    s.duplicate(['a']);
    s.bringToFront(['a']);
    s.setLocked(['a'], true);
    s.voteElement('a', 'u1', 1);
    s.reactElement('a', '👍', 'u1');
    s.addTagToSelection('todo');
    s.addComment({ point: { x: 1, y: 1 }, body: 'nope', author });
    s.replyToComment(commentId, { body: 'nope', author });
    s.resolveComment(commentId, true);
    s.deleteComment(commentId);
    s.startTimer();
    s.resetTimer(60_000);
    s.insertTemplate('kanban', { x: 0, y: 0 });
    s.undo();

    expect(localUpdates).toBe(0);
    expect(store.getState().doc.elements.a!.x).toBe(0);
    expect(Object.keys(store.getState().doc.elements)).toEqual(['a']);
    expect(store.getState().comments).toHaveLength(1);
    store.getState().dispose();
  });

  it('shows no transient (drag) preview', () => {
    const store = createCanvasStore('board-ro');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setReadOnly(true);
    store.getState().applyTransient(updateElements({ a: { x: 50 } }));
    expect(store.getState().doc.elements.a!.x).toBe(0);
    store.getState().dispose();
  });

  it('still applies remote updates', () => {
    const store = createCanvasStore('board-ro');
    store.getState().setReadOnly(true);
    const peer = new Y.Doc();
    const inner = new Y.Map<unknown>();
    peer.transact(() => {
      for (const [k, v] of Object.entries(rect('remote'))) inner.set(k, v);
      peer.getMap('elements').set('remote', inner);
    });
    store.getState().applyRemote(Y.encodeStateAsUpdate(peer));
    expect(Object.keys(store.getState().doc.elements)).toEqual(['remote']);
    store.getState().dispose();
  });

  it('keeps viewers on non-editing tools and out of voting mode', () => {
    const store = createCanvasStore('board-ro');
    store.getState().setTool('rect');
    store.getState().toggleVotingMode();
    store.getState().setReadOnly(true);
    expect(store.getState().tool).toBe('select');
    expect(store.getState().votingMode).toBe(false);

    store.getState().setTool('sticky');
    expect(store.getState().tool).toBe('select');
    store.getState().setTool('pan');
    expect(store.getState().tool).toBe('pan');
    store.getState().setTool('laser');
    expect(store.getState().tool).toBe('laser');
    store.getState().toggleVotingMode();
    expect(store.getState().votingMode).toBe(false);
    store.getState().dispose();
  });

  it('restores editing when read-only is lifted', () => {
    const store = createCanvasStore('board-ro');
    store.getState().setReadOnly(true);
    store.getState().setReadOnly(false);
    store.getState().dispatch(addElements([rect('a')]));
    expect(Object.keys(store.getState().doc.elements)).toEqual(['a']);
    store.getState().dispose();
  });
});
