/**
 * canvas-store-tags.spec.ts — TDD-first tests for tag store actions (M4-Task3).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { addElements } from '../model/commands';
import { createCanvasStore } from './canvas-store';

const rect = (id: string, overrides: Partial<CanvasElement> = {}): CanvasElement =>
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
    width: 100,
    height: 60,
    ...overrides,
  }) as CanvasElement;

describe('setElementTags', () => {
  beforeEach(() => localStorage.clear());

  it('sets tags on specified elements (undoable)', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a'), rect('b')]));
    store.getState().setElementTags(['a', 'b'], ['tag1', 'tag2']);
    expect(store.getState().doc.elements.a!.tags).toEqual(['tag1', 'tag2']);
    expect(store.getState().doc.elements.b!.tags).toEqual(['tag1', 'tag2']);
    store.getState().undo();
    expect(store.getState().doc.elements.a!.tags).toBeUndefined();
  });

  it('does nothing when ids array is empty', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setElementTags([], ['x']);
    expect(store.getState().doc.elements.a!.tags).toBeUndefined();
  });

  it('ignores unknown ids gracefully', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    expect(() => store.getState().setElementTags(['nonexistent'], ['x'])).not.toThrow();
  });
});

describe('addTagToSelection', () => {
  beforeEach(() => localStorage.clear());

  it('adds a tag to all selected elements', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a'), rect('b')]));
    store.getState().setSelected(['a', 'b']);
    store.getState().addTagToSelection('urgent');
    expect(store.getState().doc.elements.a!.tags).toContain('urgent');
    expect(store.getState().doc.elements.b!.tags).toContain('urgent');
  });

  it('does not duplicate a tag already present', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a', { tags: ['urgent'] })]));
    store.getState().setSelected(['a']);
    store.getState().addTagToSelection('urgent');
    expect(store.getState().doc.elements.a!.tags!.filter((t) => t === 'urgent')).toHaveLength(1);
  });

  it('does nothing when selection is empty', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setSelected([]);
    expect(() => store.getState().addTagToSelection('x')).not.toThrow();
  });
});

describe('removeTagFromSelection', () => {
  beforeEach(() => localStorage.clear());

  it('removes a tag from all selected elements', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([
      rect('a', { tags: ['foo', 'bar'] }),
      rect('b', { tags: ['foo'] }),
    ]));
    store.getState().setSelected(['a', 'b']);
    store.getState().removeTagFromSelection('foo');
    expect(store.getState().doc.elements.a!.tags).toEqual(['bar']);
    expect(store.getState().doc.elements.b!.tags).toEqual([]);
  });

  it('does nothing when selection is empty', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a', { tags: ['x'] })]));
    store.getState().setSelected([]);
    expect(() => store.getState().removeTagFromSelection('x')).not.toThrow();
  });
});

describe('clusterByTag', () => {
  beforeEach(() => localStorage.clear());

  it('assigns a shared groupId to all elements with the given tag', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([
      rect('a', { tags: ['team'], x: 0 }),
      rect('b', { tags: ['team'], x: 500 }),
      rect('c', { tags: ['other'] }),
    ]));
    store.getState().clusterByTag('team');
    const gidA = store.getState().doc.elements.a!.groupId;
    const gidB = store.getState().doc.elements.b!.groupId;
    expect(gidA).toBeTruthy();
    expect(gidA).toBe(gidB);
    // Element c should NOT share the groupId
    expect(store.getState().doc.elements.c!.groupId).not.toBe(gidA);
  });

  it('arranges tagged elements into a tidy layout', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([
      rect('a', { tags: ['team'], x: 800, y: 300, width: 100, height: 60 }),
      rect('b', { tags: ['team'], x: 0, y: 0, width: 100, height: 60 }),
    ]));
    store.getState().clusterByTag('team');
    // After clustering, positions should be rearranged in a row
    const a = store.getState().doc.elements.a!;
    const b = store.getState().doc.elements.b!;
    // Both elements should share the same y (row-arranged → aligned to minY)
    expect(a.y).toBe(b.y);
  });

  it('is undoable', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([
      rect('a', { tags: ['x'], x: 0 }),
      rect('b', { tags: ['x'], x: 500 }),
    ]));
    store.getState().clusterByTag('x');
    const gidAfter = store.getState().doc.elements.a!.groupId;
    expect(gidAfter).toBeTruthy();
    store.getState().undo();
    expect(store.getState().doc.elements.a!.groupId).toBeUndefined();
  });

  it('does nothing when no elements have the given tag', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    expect(() => store.getState().clusterByTag('nonexistent')).not.toThrow();
    expect(store.getState().doc.elements.a!.groupId).toBeUndefined();
  });

  it('does nothing when only one element has the tag (group needs 2+)', () => {
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a', { tags: ['solo'] })]));
    store.getState().clusterByTag('solo');
    // A single element is not a meaningful group — no groupId assigned
    expect(store.getState().doc.elements.a!.groupId).toBeUndefined();
  });
});

describe('activeTagFilter', () => {
  beforeEach(() => localStorage.clear());

  it('starts as null', () => {
    const store = createCanvasStore('local');
    expect(store.getState().activeTagFilter).toBeNull();
  });

  it('setActiveTagFilter sets the filter', () => {
    const store = createCanvasStore('local');
    store.getState().setActiveTagFilter('urgent');
    expect(store.getState().activeTagFilter).toBe('urgent');
  });

  it('setActiveTagFilter(null) clears the filter', () => {
    const store = createCanvasStore('local');
    store.getState().setActiveTagFilter('x');
    store.getState().setActiveTagFilter(null);
    expect(store.getState().activeTagFilter).toBeNull();
  });

  it('activeTagFilter is not written to the ydoc', () => {
    const store = createCanvasStore('local');
    store.getState().setActiveTagFilter('persist-me');
    // The Y.Doc elements map should be empty — filter is not doc state
    const yElements = store.getState().ydoc.getMap('elements');
    expect(yElements.size).toBe(0);
  });
});
