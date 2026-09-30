import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { getBounds, isBoxType, createElement, type ActiveStyle } from './element';

const style: ActiveStyle = {
  stroke: 'auto',
  fill: null,
  strokeWidth: 2,
  strokeStyle: 'solid',
  fontSize: 20,
};

describe('element model', () => {
  it('computes bounds for a box element', () => {
    const el = { id: 'a', type: 'rect', x: 10, y: 20, width: 100, height: 50 } as CanvasElement;
    expect(getBounds(el)).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });
  it('computes bounds for a line from its points', () => {
    const el = { id: 'b', type: 'line', x: 5, y: 5, points: [0, 0, 40, 30] } as CanvasElement;
    expect(getBounds(el)).toEqual({ x: 5, y: 5, width: 40, height: 30 });
  });
  it('knows box types', () => {
    expect(isBoxType('rect')).toBe(true);
    expect(isBoxType('line')).toBe(false);
  });
  it('creates a rect seeded from the active style', () => {
    const el = createElement('rect', { x: 3, y: 4 }, 7, style);
    expect(el).toMatchObject({ type: 'rect', x: 3, y: 4, zIndex: 7, stroke: 'auto', width: 0, height: 0 });
    expect(el.id).toBeTruthy();
  });
});

describe('getBounds with rotation', () => {
  it('returns the axis-aligned box of a shape rotated about (x, y) like Konva', () => {
    const el = { id: 'r', type: 'rect', x: 100, y: 100, width: 200, height: 10, rotation: 90 } as CanvasElement;
    const b = getBounds(el);
    // Rotating 90° about the top-left swings the long side downward and left.
    expect(b.x).toBeCloseTo(90);
    expect(b.y).toBeCloseTo(100);
    expect(b.width).toBeCloseTo(10);
    expect(b.height).toBeCloseTo(200);
  });

  it('grows the box for a 45° rotation', () => {
    const el = { id: 'r', type: 'rect', x: 0, y: 0, width: 100, height: 100, rotation: 45 } as CanvasElement;
    const b = getBounds(el);
    expect(b.width).toBeCloseTo(Math.SQRT2 * 100);
    expect(b.x).toBeCloseTo(-Math.SQRT1_2 * 100);
  });

  it('rotates line points too', () => {
    const el = { id: 'l', type: 'line', x: 0, y: 0, points: [0, 0, 100, 0], rotation: 90 } as CanvasElement;
    const b = getBounds(el);
    expect(b.x).toBeCloseTo(0);
    expect(b.width).toBeCloseTo(0);
    expect(b.height).toBeCloseTo(100);
  });

  it('uses a free connector’s fixed endpoints, not the origin', () => {
    const el = { id: 'c', type: 'connector', x: 0, y: 0, from: { x: 500, y: 600 }, to: { x: 700, y: 650 } } as CanvasElement;
    expect(getBounds(el)).toEqual({ x: 500, y: 600, width: 200, height: 50 });
  });
});
