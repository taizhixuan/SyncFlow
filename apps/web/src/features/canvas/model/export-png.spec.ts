import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { selectionBbox, canvasRectToScreen } from './export-png';
import type { View } from '../engine/viewport';

function makeEl(overrides: Partial<CanvasElement>): CanvasElement {
  return {
    id: 'el-1',
    type: 'rect',
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: '#FFFFFF',
    stroke: '#000000',
    strokeWidth: 1,
    strokeStyle: 'solid',
    width: 100,
    height: 100,
    ...overrides,
  } as CanvasElement;
}

describe('selectionBbox', () => {
  it('returns null for empty array', () => {
    expect(selectionBbox([])).toBeNull();
  });

  it('returns the exact bounds for a single element', () => {
    const el = makeEl({ x: 10, y: 20, width: 80, height: 60 });
    const bbox = selectionBbox([el]);
    expect(bbox).toEqual({ x: 10, y: 20, width: 80, height: 60 });
  });

  it('computes the union bounding box of two non-overlapping elements', () => {
    const a = makeEl({ id: 'a', x: 0, y: 0, width: 50, height: 50 });
    const b = makeEl({ id: 'b', x: 100, y: 200, width: 40, height: 30 });
    const bbox = selectionBbox([a, b]);
    // union: x=0, y=0, maxX=140, maxY=230
    expect(bbox).toEqual({ x: 0, y: 0, width: 140, height: 230 });
  });

  it('computes the union bounding box of three overlapping elements', () => {
    const a = makeEl({ id: 'a', x: 10, y: 10, width: 100, height: 100 });
    const b = makeEl({ id: 'b', x: 50, y: 50, width: 200, height: 200 });
    const c = makeEl({ id: 'c', x: 5, y: 80, width: 30, height: 40 });
    const bbox = selectionBbox([a, b, c]);
    // minX=5, minY=10, maxX=250, maxY=250
    expect(bbox).toEqual({ x: 5, y: 10, width: 245, height: 240 });
  });

  it('handles freehand elements with points array', () => {
    // points are [x0,y0, x1,y1, ...] relative to element origin
    const el = makeEl({
      id: 'fh',
      type: 'freehand',
      x: 100,
      y: 100,
      width: undefined,
      height: undefined,
      points: [0, 0, 50, 0, 50, 40, 0, 40],
    });
    const bbox = selectionBbox([el]);
    expect(bbox).toEqual({ x: 100, y: 100, width: 50, height: 40 });
  });
});

describe('canvasRectToScreen', () => {
  const identityView: View = { x: 0, y: 0, scale: 1 };

  it('is a no-op at identity transform', () => {
    const rect = { x: 10, y: 20, width: 100, height: 80 };
    expect(canvasRectToScreen(rect, identityView)).toEqual(rect);
  });

  it('scales width and height but leaves origin unchanged when pan is zero', () => {
    const view: View = { x: 0, y: 0, scale: 2 };
    const rect = { x: 10, y: 20, width: 100, height: 80 };
    expect(canvasRectToScreen(rect, view)).toEqual({ x: 20, y: 40, width: 200, height: 160 });
  });

  it('applies pan offset correctly at identity scale', () => {
    const view: View = { x: 50, y: -30, scale: 1 };
    const rect = { x: 10, y: 20, width: 100, height: 80 };
    expect(canvasRectToScreen(rect, view)).toEqual({ x: 60, y: -10, width: 100, height: 80 });
  });

  it('applies combined pan + zoom (non-identity view)', () => {
    // Typical mid-session state: zoomed in 2×, panned to (100, 150)
    const view: View = { x: 100, y: 150, scale: 2 };
    const rect = { x: 50, y: 75, width: 200, height: 100 };
    // x: 50*2 + 100 = 200, y: 75*2 + 150 = 300, w: 400, h: 200
    expect(canvasRectToScreen(rect, view)).toEqual({ x: 200, y: 300, width: 400, height: 200 });
  });

  it('handles fractional scale (zoom-out)', () => {
    const view: View = { x: 0, y: 0, scale: 0.5 };
    const rect = { x: 0, y: 0, width: 400, height: 300 };
    expect(canvasRectToScreen(rect, view)).toEqual({ x: 0, y: 0, width: 200, height: 150 });
  });

  it('round-trip: canvasRectToScreen then back matches original', () => {
    const view: View = { x: 123, y: -45, scale: 1.5 };
    const original = { x: 80, y: 60, width: 120, height: 90 };
    const screen = canvasRectToScreen(original, view);
    // Inverse: canvasX = (screenX - panX) / scale
    const backX = (screen.x - view.x) / view.scale;
    const backY = (screen.y - view.y) / view.scale;
    const backW = screen.width / view.scale;
    const backH = screen.height / view.scale;
    expect(backX).toBeCloseTo(original.x);
    expect(backY).toBeCloseTo(original.y);
    expect(backW).toBeCloseTo(original.width);
    expect(backH).toBeCloseTo(original.height);
  });
});
