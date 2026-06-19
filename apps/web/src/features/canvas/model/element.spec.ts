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
