/**
 * canvas-store-templates.spec.ts — tests for insertTemplate store action (M5-Task1).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvasStore } from './canvas-store';

describe('insertTemplate (store action)', () => {
  beforeEach(() => localStorage.clear());

  it('inserts a retro template with at least 4 elements (3 frames + stickies)', () => {
    const store = createCanvasStore('local');
    store.getState().insertTemplate('retro', { x: 0, y: 0 });
    const count = Object.keys(store.getState().doc.elements).length;
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('inserts a kanban template with at least 4 elements', () => {
    const store = createCanvasStore('local');
    store.getState().insertTemplate('kanban', { x: 0, y: 0 });
    const count = Object.keys(store.getState().doc.elements).length;
    expect(count).toBeGreaterThanOrEqual(4);
  });

  it('inserts a flowchart template with at least 3 elements', () => {
    const store = createCanvasStore('local');
    store.getState().insertTemplate('flowchart', { x: 0, y: 0 });
    const count = Object.keys(store.getState().doc.elements).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it('inserts a mindmap template with at least 4 mindnodes', () => {
    const store = createCanvasStore('local');
    store.getState().insertTemplate('mindmap', { x: 0, y: 0 });
    const els = Object.values(store.getState().doc.elements);
    const nodes = els.filter((e) => e.type === 'mindnode');
    expect(nodes.length).toBeGreaterThanOrEqual(4);
  });

  it('inserts a user-story-map template with frames and stickies', () => {
    const store = createCanvasStore('local');
    store.getState().insertTemplate('user-story-map', { x: 0, y: 0 });
    const els = Object.values(store.getState().doc.elements);
    expect(els.filter((e) => e.type === 'frame').length).toBeGreaterThanOrEqual(2);
    expect(els.filter((e) => e.type === 'sticky').length).toBeGreaterThanOrEqual(2);
  });

  it('selects all inserted elements', () => {
    const store = createCanvasStore('local');
    store.getState().insertTemplate('kanban', { x: 0, y: 0 });
    const insertedIds = Object.keys(store.getState().doc.elements);
    const selected = store.getState().selected;
    expect(selected.sort()).toEqual(insertedIds.sort());
  });

  it('is undoable in a single step', () => {
    const store = createCanvasStore('local');
    store.getState().insertTemplate('retro', { x: 0, y: 0 });
    expect(Object.keys(store.getState().doc.elements).length).toBeGreaterThan(0);
    store.getState().undo();
    expect(Object.keys(store.getState().doc.elements)).toHaveLength(0);
  });

  it('origin offsets all elements (non-zero origin)', () => {
    const store1 = createCanvasStore('local');
    const store2 = createCanvasStore('local-b');
    store1.getState().insertTemplate('kanban', { x: 0, y: 0 });
    store2.getState().insertTemplate('kanban', { x: 500, y: 300 });
    const els1 = Object.values(store1.getState().doc.elements);
    const els2 = Object.values(store2.getState().doc.elements);
    // Every element in store2 should be offset by (500, 300) compared to store1
    // (check by summing all x and comparing).
    const sumX1 = els1.reduce((a, e) => a + e.x, 0);
    const sumX2 = els2.reduce((a, e) => a + e.x, 0);
    // store2 total x = store1 total x + 500 * count
    expect(sumX2).toBeCloseTo(sumX1 + 500 * els1.length);
  });
});
