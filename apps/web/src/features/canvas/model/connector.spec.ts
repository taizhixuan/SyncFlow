import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { edgePoint, resolveConnector } from './connector';

describe('edgePoint', () => {
  it('exits the box boundary toward the target on the right edge', () => {
    expect(edgePoint({ x: 0, y: 0, width: 100, height: 100 }, { x: 200, y: 50 })).toEqual({ x: 100, y: 50 });
  });
  it('exits on the top edge toward an upward target', () => {
    expect(edgePoint({ x: 0, y: 0, width: 100, height: 100 }, { x: 50, y: -200 })).toEqual({ x: 50, y: 0 });
  });
});

describe('resolveConnector', () => {
  const a = { id: 'a', type: 'rect', x: 0, y: 0, width: 100, height: 100 } as CanvasElement;
  const b = { id: 'b', type: 'rect', x: 300, y: 0, width: 100, height: 100 } as CanvasElement;

  it('resolves edge points between two bound elements', () => {
    const conn = { id: 'c', type: 'connector', x: 0, y: 0, from: { elementId: 'a' }, to: { elementId: 'b' } } as CanvasElement;
    const r = resolveConnector(conn, { a, b });
    expect(r.from).toEqual({ x: 100, y: 50 }); // a's right edge
    expect(r.to).toEqual({ x: 300, y: 50 }); // b's left edge
  });

  it('uses explicit coordinates for a dangling end', () => {
    const conn = { id: 'c', type: 'connector', x: 0, y: 0, from: { elementId: 'a' }, to: { x: 250, y: 250 } } as CanvasElement;
    const r = resolveConnector(conn, { a });
    expect(r.to).toEqual({ x: 250, y: 250 });
  });
});

describe('resolveConnector with a missing bound element', () => {
  const a = { id: 'a', type: 'rect', x: 1000, y: 1000, width: 100, height: 100 } as CanvasElement;

  it('uses the last-known point stored with the binding', () => {
    const conn = { id: 'c', type: 'connector', x: 0, y: 0,
      from: { elementId: 'a' }, to: { elementId: 'gone', x: 1500, y: 1050 } } as CanvasElement;
    expect(resolveConnector(conn, { a }).to).toEqual({ x: 1500, y: 1050 });
  });

  it('collapses onto the other end instead of streaking to (0, 0)', () => {
    const conn = { id: 'c', type: 'connector', x: 0, y: 0,
      from: { elementId: 'a' }, to: { elementId: 'gone' } } as CanvasElement;
    const r = resolveConnector(conn, { a });
    expect(r.to.x).toBeGreaterThanOrEqual(1000);
    expect(r.to.y).toBeGreaterThanOrEqual(1000);
    expect(r.from.x).toBeGreaterThanOrEqual(1000);
  });
});
