/**
 * Live drag/resize preview. Moving shapes only repositioned their Konva nodes
 * until release, while arrows and mind-map links are drawn from the board
 * model, so they stayed behind and jumped into place at the end. The preview
 * now goes through the store's transient overlay every frame.
 *
 * Like canvas-stage-culling.spec, this renders a REAL Konva stage (with a no-op
 * 2D context) so drag events reach the real handlers.
 */
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { CanvasElement } from '@syncflow/shared';

const context2d = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'measureText') return () => ({ width: 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
      if (prop === 'createPattern') return () => null;
      return () => {};
    },
    set: () => true,
  },
);

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => context2d) as never;
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
  }
});

const { CanvasStage } = await import('./canvas-stage');
const { createCanvasStore } = await import('../engine/canvas-store');
const { addElements } = await import('../model/commands');

type KNode = {
  id(): string;
  x(): number;
  y(): number;
  position(p: { x: number; y: number }): void;
  fire(type: string, evt?: object, bubble?: boolean): void;
};
type Stage = { findOne(selector: string): KNode | undefined };

const base = {
  rotation: 0,
  opacity: 1,
  fill: null,
  stroke: 'auto',
  strokeWidth: 2,
  strokeStyle: 'solid',
} as const;
const rect = (id: string, x: number, y: number, zIndex: number): CanvasElement =>
  ({ ...base, id, type: 'rect', x, y, width: 100, height: 60, zIndex }) as CanvasElement;

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

async function mount(elements: CanvasElement[], selected: string[]) {
  const store = createCanvasStore('local');
  let stage: Stage | null = null;
  await act(async () => {
    render(<CanvasStage store={store} onStageMount={(s) => { stage = s as unknown as Stage; }} />);
  });
  await act(async () => {
    store.getState().dispatch(addElements(elements));
    store.getState().setSelected(selected);
  });
  return { store, stage: stage! };
}

async function dragBy(stage: Stage, id: string, dx: number, dy: number): Promise<KNode> {
  const node = stage.findOne(`#${id}`)!;
  const x0 = node.x();
  const y0 = node.y();
  await act(async () => {
    node.fire('dragstart', { evt: new MouseEvent('mousedown') });
    node.position({ x: x0 + dx, y: y0 + dy });
    node.fire('dragmove', { evt: new MouseEvent('mousemove') });
    await nextFrame();
  });
  return node;
}

describe('live drag preview', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('moves arrows with the shapes while dragging, not only on release', async () => {
    const elements = [
      rect('a', 0, 0, 1),
      rect('b', 300, 0, 2),
      // Bound to a and b: drawn from their positions in the model.
      { ...base, id: 'c', type: 'connector', x: 0, y: 0, zIndex: 3, from: { elementId: 'a' }, to: { elementId: 'b' } },
      // A free arrow in the selection: its own points must move too.
      { ...base, id: 'f', type: 'connector', x: 0, y: 0, zIndex: 4, from: { x: 0, y: 200 }, to: { x: 100, y: 200 } },
    ] as CanvasElement[];
    const { store, stage } = await mount(elements, ['a', 'b', 'f']);

    const node = await dragBy(stage, 'a', 50, 40);

    // Mid-drag, the model the arrows are drawn from has already moved.
    const mid = store.getState().doc.elements;
    expect(mid.a).toMatchObject({ x: 50, y: 40 });
    expect(mid.b).toMatchObject({ x: 350, y: 40 });
    expect(mid.f!.from).toMatchObject({ x: 50, y: 240 });

    await act(async () => {
      node.fire('dragend', { evt: new MouseEvent('mouseup') });
    });

    // Committed once: the free arrow is not shifted twice by preview + commit.
    const end = store.getState().doc.elements;
    expect(end.a).toMatchObject({ x: 50, y: 40 });
    expect(end.f!.from).toMatchObject({ x: 50, y: 240 });
    expect(end.f!.to).toMatchObject({ x: 150, y: 240 });
  });

  it('moves mind-map links with a dragged node', async () => {
    const node = (id: string, x: number, parentId?: string): CanvasElement =>
      ({ ...base, id, type: 'mindnode', x, y: 0, width: 120, height: 40, zIndex: 1, text: id, ...(parentId ? { parentId } : {}) }) as CanvasElement;
    const { store, stage } = await mount([node('root', 0), node('child', 300, 'root')], ['child']);

    await dragBy(stage, 'child', 0, 120);

    expect(store.getState().doc.elements.child).toMatchObject({ x: 300, y: 120 });
  });

  it('moves bound arrows with a shape while it is resized, and commits the size once', async () => {
    const elements = [
      rect('a', 0, 0, 1),
      rect('b', 300, 0, 2),
      { ...base, id: 'c', type: 'connector', x: 0, y: 0, zIndex: 3, from: { elementId: 'a' }, to: { elementId: 'b' } },
    ] as CanvasElement[];
    const { store, stage } = await mount(elements, ['a']);
    const node = stage.findOne('#a') as KNode & { scaleX(v?: number): number };
    const tr = (stage as unknown as { findOne(s: string): KNode }).findOne('Transformer');

    await act(async () => {
      // What the Transformer does to the node while its right handle is dragged.
      node.scaleX(2);
      tr.fire('transform', { evt: new MouseEvent('mousemove') });
      await nextFrame();
    });

    // The arrows' view of the board has the new width; the shape's own model
    // has not changed yet (the Transformer is still scaling its node).
    expect(store.getState().linkPreview?.a).toMatchObject({ width: 200 });
    expect(store.getState().doc.elements.a!.width).toBe(100);

    await act(async () => {
      tr.fire('transformend', { evt: new MouseEvent('mouseup') });
    });
    expect(store.getState().linkPreview).toBeNull();
    expect(store.getState().doc.elements.a!.width).toBe(200);
  });
});
