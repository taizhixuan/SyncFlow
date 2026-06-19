import { beforeEach, describe, expect, it } from 'vitest';
import { createCanvasStore } from '../engine/canvas-store';
import { getTool } from './tools';

function ctxFor(store: ReturnType<typeof createCanvasStore>, point: () => { x: number; y: number }) {
  return { store: store.getState(), getCanvasPoint: point };
}

describe('draw tools', () => {
  let store: ReturnType<typeof createCanvasStore>;
  beforeEach(() => {
    localStorage.clear();
    store = createCanvasStore('local');
    store.getState().setTool('rect');
  });

  it('drag creates one rect sized by the gesture', () => {
    const tool = getTool('rect');
    let p = { x: 10, y: 10 };
    tool.onDown(ctxFor(store, () => p), 'stage');
    p = { x: 110, y: 70 };
    tool.onMove(ctxFor(store, () => p));
    tool.onUp(ctxFor(store, () => p));
    const els = Object.values(store.getState().doc.elements);
    expect(els).toHaveLength(1);
    expect(els[0]!).toMatchObject({ type: 'rect', width: 100, height: 60 });
  });

  it('shows a live preview while dragging, before release', () => {
    const tool = getTool('rect');
    let p = { x: 10, y: 10 };
    tool.onDown(ctxFor(store, () => p), 'stage');
    p = { x: 110, y: 70 };
    tool.onMove(ctxFor(store, () => p));
    // DURING the drag (no onUp yet) the in-progress shape must be visible.
    const els = Object.values(store.getState().doc.elements);
    expect(els).toHaveLength(1);
    expect(els[0]!).toMatchObject({ type: 'rect', width: 100, height: 60 });
  });

  it('drag sizes a diamond by the gesture', () => {
    store.getState().setTool('diamond');
    const tool = getTool('diamond');
    let p = { x: 0, y: 0 };
    tool.onDown(ctxFor(store, () => p), 'stage');
    p = { x: 80, y: 40 };
    tool.onMove(ctxFor(store, () => p));
    tool.onUp(ctxFor(store, () => p));
    const els = Object.values(store.getState().doc.elements);
    expect(els).toHaveLength(1);
    expect(els[0]!).toMatchObject({ type: 'diamond', width: 80, height: 40 });
  });

  it('a zero-size click creates nothing', () => {
    const tool = getTool('rect');
    const p = { x: 10, y: 10 };
    tool.onDown(ctxFor(store, () => p), 'stage');
    tool.onUp(ctxFor(store, () => p));
    expect(Object.values(store.getState().doc.elements)).toHaveLength(0);
  });

  it('a whole draw gesture is a single undo (one undo removes the shape)', () => {
    const tool = getTool('rect');
    let p = { x: 10, y: 10 };
    tool.onDown(ctxFor(store, () => p), 'stage');
    p = { x: 110, y: 70 };
    tool.onMove(ctxFor(store, () => p));
    tool.onUp(ctxFor(store, () => p));
    expect(Object.values(store.getState().doc.elements)).toHaveLength(1);
    store.getState().undo();
    expect(Object.values(store.getState().doc.elements)).toHaveLength(0);
    store.getState().redo();
    expect(Object.values(store.getState().doc.elements)).toHaveLength(1);
  });
});

describe('special tools', () => {
  it('resolves the image tool (placement is handled in the stage, so it is a no-op)', () => {
    localStorage.clear();
    const tool = getTool('image');
    expect(tool.id).toBe('image');
    // Must be a safe no-op: invoking its handlers adds no elements.
    const s = createCanvasStore('local');
    const before = Object.values(s.getState().doc.elements).length;
    const noop = { store: s.getState(), getCanvasPoint: () => ({ x: 0, y: 0 }) };
    tool.onDown(noop, 'stage');
    tool.onMove(noop);
    tool.onUp(noop);
    expect(Object.values(s.getState().doc.elements)).toHaveLength(before);
  });
});
