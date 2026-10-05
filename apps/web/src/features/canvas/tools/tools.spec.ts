import { beforeEach, describe, expect, it } from 'vitest';
import { createElement, type ActiveStyle } from '../model/element';
import { addElements } from '../model/commands';
import { createCanvasStore } from '../engine/canvas-store';
import { getTool } from './tools';

const DEFAULT_STYLE: ActiveStyle = {
  stroke: 'auto',
  fill: null,
  strokeWidth: 2,
  strokeStyle: 'solid',
  fontSize: 16,
};

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

describe('cancelling a draw gesture', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('drops the in-progress shape without committing it', () => {
    const store = createCanvasStore('local');
    store.getState().setTool('rect');
    const tool = getTool('rect');
    let p = { x: 10, y: 10 };
    tool.onDown(ctxFor(store, () => p), 'stage');
    p = { x: 110, y: 70 };
    tool.onMove(ctxFor(store, () => p));
    expect(Object.values(store.getState().doc.elements)).toHaveLength(1); // live preview
    tool.onCancel?.(ctxFor(store, () => p));
    expect(Object.values(store.getState().doc.elements)).toHaveLength(0);
  });

  it('keeps the tool active so the next gesture still draws', () => {
    const store = createCanvasStore('local');
    store.getState().setTool('rect');
    const tool = getTool('rect');
    const p = { x: 10, y: 10 };
    tool.onDown(ctxFor(store, () => p), 'stage');
    tool.onCancel?.(ctxFor(store, () => p));
    expect(store.getState().tool).toBe('rect');
  });

  it('forgets the draft so a later release commits nothing', () => {
    const store = createCanvasStore('local');
    store.getState().setTool('rect');
    const tool = getTool('rect');
    let p = { x: 10, y: 10 };
    tool.onDown(ctxFor(store, () => p), 'stage');
    p = { x: 110, y: 70 };
    tool.onMove(ctxFor(store, () => p));
    tool.onCancel?.(ctxFor(store, () => p));
    tool.onUp(ctxFor(store, () => p));
    expect(Object.values(store.getState().doc.elements)).toHaveLength(0);
  });
});

describe('click-only line and freehand gestures', () => {
  let store: ReturnType<typeof createCanvasStore>;
  beforeEach(() => {
    localStorage.clear();
    store = createCanvasStore('local');
  });

  for (const type of ['line', 'freehand'] as const) {
    it(`a click without a drag commits no ${type}`, () => {
      store.getState().setTool(type);
      const tool = getTool(type);
      const p = { x: 50, y: 50 };
      tool.onDown(ctxFor(store, () => p), 'stage');
      tool.onUp(ctxFor(store, () => p));
      expect(Object.keys(store.getState().doc.elements)).toHaveLength(0);
    });

    it(`a sub-pixel jitter commits no ${type}`, () => {
      store.getState().setTool(type);
      const tool = getTool(type);
      let p = { x: 50, y: 50 };
      tool.onDown(ctxFor(store, () => p), 'stage');
      p = { x: 51, y: 50.5 };
      tool.onMove(ctxFor(store, () => p));
      tool.onUp(ctxFor(store, () => p));
      expect(Object.keys(store.getState().doc.elements)).toHaveLength(0);
    });

    it(`a real drag still commits a ${type}`, () => {
      store.getState().setTool(type);
      const tool = getTool(type);
      let p = { x: 50, y: 50 };
      tool.onDown(ctxFor(store, () => p), 'stage');
      p = { x: 120, y: 90 };
      tool.onMove(ctxFor(store, () => p));
      tool.onUp(ctxFor(store, () => p));
      expect(Object.keys(store.getState().doc.elements)).toHaveLength(1);
    });
  }
});

describe('drawing and placing inside a frame', () => {
  let store: ReturnType<typeof createCanvasStore>;
  const frame = { ...createElement('frame', { x: 0, y: 0 }, -1, DEFAULT_STYLE), id: 'f' };
  beforeEach(() => {
    localStorage.clear();
    store = createCanvasStore('local');
    store.getState().dispatch(addElements([frame]));
  });

  it('draws a rect started on the frame body', () => {
    store.getState().setTool('rect');
    const tool = getTool('rect');
    let p = { x: 40, y: 40 };
    tool.onDown(ctxFor(store, () => p), 'frame');
    p = { x: 140, y: 100 };
    tool.onMove(ctxFor(store, () => p));
    tool.onUp(ctxFor(store, () => p));
    expect(Object.values(store.getState().doc.elements).filter((e) => e.type === 'rect')).toHaveLength(1);
  });

  it('treats an element press that lands on a frame body as the canvas', () => {
    store.getState().setTool('rect');
    const tool = getTool('rect');
    let p = { x: 40, y: 40 };
    tool.onDown(ctxFor(store, () => p), 'element');
    p = { x: 140, y: 100 };
    tool.onMove(ctxFor(store, () => p));
    tool.onUp(ctxFor(store, () => p));
    expect(Object.values(store.getState().doc.elements).filter((e) => e.type === 'rect')).toHaveLength(1);
  });

  it('places a sticky on a frame', () => {
    store.getState().setTool('sticky');
    getTool('sticky').onDown(ctxFor(store, () => ({ x: 60, y: 60 })), 'element');
    expect(Object.values(store.getState().doc.elements).filter((e) => e.type === 'sticky')).toHaveLength(1);
  });

  it('still ignores a press on a shape sitting in the frame', () => {
    const shape = { ...createElement('rect', { x: 30, y: 30 }, 1, DEFAULT_STYLE), id: 's', width: 50, height: 50 };
    store.getState().dispatch(addElements([shape]));
    store.getState().setTool('sticky');
    getTool('sticky').onDown(ctxFor(store, () => ({ x: 50, y: 50 })), 'element');
    expect(Object.values(store.getState().doc.elements).filter((e) => e.type === 'sticky')).toHaveLength(0);
  });

  it('ignores a press on a shape outside any frame', () => {
    const shape = { ...createElement('rect', { x: 900, y: 900 }, 1, DEFAULT_STYLE), id: 's', width: 50, height: 50 };
    store.getState().dispatch(addElements([shape]));
    store.getState().setTool('sticky');
    getTool('sticky').onDown(ctxFor(store, () => ({ x: 920, y: 920 })), 'element');
    expect(Object.values(store.getState().doc.elements).filter((e) => e.type === 'sticky')).toHaveLength(0);
  });
});
