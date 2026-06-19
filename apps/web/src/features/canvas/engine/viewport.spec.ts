import { describe, expect, it } from 'vitest';
import { screenToCanvas, zoomAtPoint } from './viewport';

describe('viewport', () => {
  it('converts screen to canvas coords under pan+zoom', () => {
    expect(screenToCanvas({ x: 100, y: 50, scale: 2 }, { x: 300, y: 250 })).toEqual({ x: 100, y: 100 });
  });
  it('keeps the zoom anchor point stationary', () => {
    const v = zoomAtPoint({ x: 0, y: 0, scale: 1 }, { x: 200, y: 200 }, 2);
    expect(v.scale).toBe(2);
    expect(screenToCanvas(v, { x: 200, y: 200 })).toEqual(
      screenToCanvas({ x: 0, y: 0, scale: 1 }, { x: 200, y: 200 }),
    );
  });
  it('clamps scale to [min,max]', () => {
    expect(zoomAtPoint({ x: 0, y: 0, scale: 4 }, { x: 0, y: 0 }, 2, 0.2, 4).scale).toBe(4);
  });
});
