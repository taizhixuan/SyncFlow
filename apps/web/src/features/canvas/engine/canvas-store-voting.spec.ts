/**
 * Voting + reaction store action tests (M4-Task2).
 * These test voteElement and reactElement against a real canvas store.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { addElements } from '../model/commands';
import { createCanvasStore } from './canvas-store';

const rect = (id: string): CanvasElement =>
  ({
    id,
    type: 'rect',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
    strokeStyle: 'solid',
  }) as CanvasElement;

describe('voteElement', () => {
  beforeEach(() => localStorage.clear());

  it('adds a vote for a user', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().voteElement('a', 'u1', 1);
    expect(store.getState().doc.elements.a!.votes).toEqual({ u1: 1 });
  });

  it('increments an existing vote', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().voteElement('a', 'u1', 1);
    store.getState().voteElement('a', 'u1', 1);
    expect(store.getState().doc.elements.a!.votes?.u1).toBe(2);
  });

  it('removes vote key when count reaches 0', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().voteElement('a', 'u1', 1);
    store.getState().voteElement('a', 'u1', -1);
    const votes = store.getState().doc.elements.a!.votes;
    expect(votes?.u1).toBeUndefined();
  });

  it('is undoable', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().voteElement('a', 'u1', 1);
    expect(store.getState().doc.elements.a!.votes?.u1).toBe(1);
    store.getState().undo();
    expect(store.getState().doc.elements.a!.votes?.u1).toBeUndefined();
  });

  it('does nothing for a missing element', () => {
    const store = createCanvasStore('local');
    // Should not throw
    store.getState().voteElement('nonexistent', 'u1', 1);
    expect(store.getState().doc.elements).toEqual({});
  });
});

describe('reactElement', () => {
  beforeEach(() => localStorage.clear());

  it('adds a reaction for a user', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().reactElement('a', '👍', 'u1');
    expect(store.getState().doc.elements.a!.reactions).toEqual({ '👍': ['u1'] });
  });

  it('toggles reaction off when user already reacted', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().reactElement('a', '👍', 'u1');
    store.getState().reactElement('a', '👍', 'u1');
    const reactions = store.getState().doc.elements.a!.reactions;
    expect(reactions?.['👍']).toBeUndefined();
  });

  it('multiple users can react with the same emoji', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().reactElement('a', '❤️', 'u1');
    store.getState().reactElement('a', '❤️', 'u2');
    expect(store.getState().doc.elements.a!.reactions?.['❤️']).toEqual(expect.arrayContaining(['u1', 'u2']));
  });

  it('is undoable', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().reactElement('a', '👍', 'u1');
    expect(store.getState().doc.elements.a!.reactions?.['👍']).toContain('u1');
    store.getState().undo();
    expect(store.getState().doc.elements.a!.reactions?.['👍']).toBeUndefined();
  });

  it('does nothing for a missing element', () => {
    const store = createCanvasStore('local');
    // Should not throw
    store.getState().reactElement('nonexistent', '👍', 'u1');
    expect(store.getState().doc.elements).toEqual({});
  });
});
