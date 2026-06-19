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

  it('a zero-size click creates nothing', () => {
    const tool = getTool('rect');
    const p = { x: 10, y: 10 };
    tool.onDown(ctxFor(store, () => p), 'stage');
    tool.onUp(ctxFor(store, () => p));
    expect(Object.values(store.getState().doc.elements)).toHaveLength(0);
  });
});
