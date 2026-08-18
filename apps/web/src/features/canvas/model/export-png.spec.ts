import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { selectionBbox, canvasRectToScreen, resolveExportScale } from './export-png';
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

describe('resolveExportScale', () => {
  const board = { width: 1000, height: 800 };

  it('divides the zoom back out so output resolution does not depend on it', () => {
    // Konva renders an export through the node transform, which carries the
    // zoom. The pixelRatio has to cancel it for 2x to actually mean 2x.
    expect(resolveExportScale(2, 0.25, board).pixelRatio).toBe(8);
    expect(resolveExportScale(2, 4, board).pixelRatio).toBe(0.5);
    expect(resolveExportScale(2, 1, board).pixelRatio).toBe(2);
  });

  it('yields the same output pixel count at every zoom level', () => {
    const widthAt = (zoom: number): number => {
      const screenWidth = board.width * zoom; // what the caller passes Konva
      return screenWidth * resolveExportScale(3, zoom, board).pixelRatio;
    };
    expect(widthAt(0.2)).toBeCloseTo(3000);
    expect(widthAt(1)).toBeCloseTo(3000);
    expect(widthAt(4)).toBeCloseTo(3000);
  });

  it('reports the requested multiplier as achieved when it fits', () => {
    const scale = resolveExportScale(4, 1, board);
    expect(scale.effectiveMultiplier).toBe(4);
    expect(scale.clamped).toBe(false);
  });

  it('clamps a request that would exceed the max canvas side', () => {
    const scale = resolveExportScale(4, 1, { width: 12_000, height: 100 });
    expect(scale.clamped).toBe(true);
    expect(scale.effectiveMultiplier * 12_000).toBeLessThanOrEqual(16_384);
  });

  it('clamps a request that would exceed the max canvas area', () => {
    const wide = { width: 10_000, height: 10_000 };
    const scale = resolveExportScale(4, 1, wide);
    expect(scale.clamped).toBe(true);
    const area = scale.effectiveMultiplier * wide.width * scale.effectiveMultiplier * wide.height;
    expect(area).toBeLessThanOrEqual(134_217_728);
  });

  it('treats a nonsense zoom as 1 rather than dividing by zero', () => {
    expect(resolveExportScale(2, 0, board).pixelRatio).toBe(2);
    expect(Number.isFinite(resolveExportScale(2, Number.NaN, board).pixelRatio)).toBe(true);
  });
});
