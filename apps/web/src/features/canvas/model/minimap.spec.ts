import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import type { View } from '../engine/viewport';
import {
  boardBounds,
  fitTransform,
  viewportRectInMini,
  miniPointToBoard,
  type MiniTransform,
} from './minimap';

// ── helpers ──────────────────────────────────────────────────────────────────

function box(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 80,
): CanvasElement {
  return {
    id,
    type: 'rect',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 1,
    strokeStyle: 'solid',
  } as CanvasElement;
}

// ── boardBounds ───────────────────────────────────────────────────────────────

describe('boardBounds', () => {
  it('returns a sensible default rect for an empty board', () => {
    const r = boardBounds([]);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });

  it('covers a single element exactly', () => {
    const r = boardBounds([box('a', 10, 20, 50, 40)]);
    expect(r.x).toBe(10);
    expect(r.y).toBe(20);
    expect(r.width).toBe(50);
    expect(r.height).toBe(40);
  });

  it('covers the union of all element bounds', () => {
    // a: 0..100 x 0..80, b: 150..250 x 50..130
    const els = [box('a', 0, 0, 100, 80), box('b', 150, 50, 100, 80)];
    const r = boardBounds(els);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(250); // 0 to 250
    expect(r.height).toBe(130); // 0 to 130
  });

  it('handles elements at negative coordinates', () => {
    const els = [box('a', -200, -100, 50, 50), box('b', 100, 100, 50, 50)];
    const r = boardBounds(els);
    expect(r.x).toBe(-200);
    expect(r.y).toBe(-100);
    expect(r.width).toBe(350); // -200 to 150
    expect(r.height).toBe(250); // -100 to 150
  });
});

// ── fitTransform ─────────────────────────────────────────────────────────────

describe('fitTransform', () => {
  it('fits a square bounds into a square minimap', () => {
    const bounds = { x: 0, y: 0, width: 1000, height: 1000 };
    const mini = { width: 180, height: 120 };
    const pad = 8;
    const t = fitTransform(bounds, mini, pad);
    // scale: min(164/1000, 104/1000) = 0.104 (height-limited for square+short minimap)
    expect(t.scale).toBeCloseTo(0.104, 5);
    // The scene should be centered in the minimap
    expect(t.offsetX).toBeCloseTo(pad + (mini.width - 2 * pad - 1000 * t.scale) / 2, 2);
    expect(t.offsetY).toBeCloseTo(pad, 2);
  });

  it('preserves aspect ratio (wide bounds → width-limited)', () => {
    const bounds = { x: 0, y: 0, width: 2000, height: 500 };
    const mini = { width: 180, height: 120 };
    const t = fitTransform(bounds, mini, 8);
    // usable: 164 x 104; scale = min(164/2000, 104/500) = 0.082
    expect(t.scale).toBeCloseTo(0.082, 5);
    // rendered h = 500*0.082 = 41 < 104 → vertically centered
    const renderedH = 500 * t.scale;
    expect(t.offsetY).toBeCloseTo(8 + (104 - renderedH) / 2, 2);
  });

  it('uses default padding of 8 when not provided', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const mini = { width: 180, height: 120 };
    const t1 = fitTransform(bounds, mini);
    const t2 = fitTransform(bounds, mini, 8);
    expect(t1.scale).toBeCloseTo(t2.scale, 10);
    expect(t1.offsetX).toBeCloseTo(t2.offsetX, 10);
    expect(t1.offsetY).toBeCloseTo(t2.offsetY, 10);
  });

  it('maps bounds origin to expected minimap offset', () => {
    // bounds at (100, 200) — origin offset should land at offsetX/offsetY
    const bounds = { x: 100, y: 200, width: 500, height: 500 };
    const mini = { width: 180, height: 120 };
    const t = fitTransform(bounds, mini, 0);
    // boardX 100 → miniX: (100 - bounds.x) * scale + offsetX = 0*scale + offsetX = offsetX
    // so the top-left board corner maps to (offsetX, offsetY) = (0, offsetY)
    const miniX = (100 - bounds.x) * t.scale + t.offsetX;
    expect(miniX).toBeCloseTo(t.offsetX, 6);
  });
});

// ── viewportRectInMini ────────────────────────────────────────────────────────

describe('viewportRectInMini', () => {
  // Minimal transform: board coords → minimap coords
  const t: MiniTransform = { scale: 0.1, offsetX: 5, offsetY: 5 };
  const stage = { width: 800, height: 600 };

  it('returns a rect in minimap coords for a centered view', () => {
    // view.x=0, view.y=0, view.scale=1 → canvas visible is [0..800] x [0..600]
    const view: View = { x: 0, y: 0, scale: 1 };
    const r = viewportRectInMini(view, stage, t);
    // canvas corner (0,0) → mini (0*0.1+5, 0*0.1+5) = (5,5)
    expect(r.x).toBeCloseTo(5, 5);
    expect(r.y).toBeCloseTo(5, 5);
    // canvas corner (800,600) → mini (80+5, 60+5) = (85,65)
    expect(r.width).toBeCloseTo(80, 5);
    expect(r.height).toBeCloseTo(60, 5);
  });

  it('accounts for view pan', () => {
    // pan by -100 in each direction at scale 1 → canvas top-left is (100,100)
    const view: View = { x: -100, y: -100, scale: 1 };
    const r = viewportRectInMini(view, stage, t);
    // canvas TL = screenToCanvas(view, {0,0}) = (0-(-100))/1 = (100,100)
    expect(r.x).toBeCloseTo(100 * 0.1 + 5, 5);
    expect(r.y).toBeCloseTo(100 * 0.1 + 5, 5);
  });

  it('accounts for zoom', () => {
    // scale=2, x=0, y=0 → canvas top-left = (0,0), canvas bottom-right = (400,300)
    const view: View = { x: 0, y: 0, scale: 2 };
    const r = viewportRectInMini(view, stage, t);
    // canvas BR = (800/2, 600/2) = (400,300)
    expect(r.width).toBeCloseTo(400 * 0.1, 5);
    expect(r.height).toBeCloseTo(300 * 0.1, 5);
  });
});

// ── miniPointToBoard ──────────────────────────────────────────────────────────

describe('miniPointToBoard', () => {
  const t: MiniTransform = { scale: 0.1, offsetX: 5, offsetY: 5 };

  it('inverts a minimap point back to board coords', () => {
    // boardX 200 → miniX = 200*0.1+5 = 25 → boardX should be 200
    const result = miniPointToBoard({ x: 25, y: 15 }, t);
    expect(result.x).toBeCloseTo(200, 5);
    expect(result.y).toBeCloseTo(100, 5);
  });

  it('is the exact inverse of the forward transform', () => {
    const boardPt = { x: 350, y: 280 };
    // forward: miniX = boardX * scale + offsetX
    const miniX = boardPt.x * t.scale + t.offsetX;
    const miniY = boardPt.y * t.scale + t.offsetY;
    const back = miniPointToBoard({ x: miniX, y: miniY }, t);
    expect(back.x).toBeCloseTo(boardPt.x, 10);
    expect(back.y).toBeCloseTo(boardPt.y, 10);
  });

  it('round-trips through origin offset', () => {
    const tOffset: MiniTransform = { scale: 0.08, offsetX: 12, offsetY: 7 };
    const pts = [
      { x: 0, y: 0 },
      { x: -500, y: 300 },
      { x: 1000, y: -200 },
    ];
    for (const pt of pts) {
      const miniX = pt.x * tOffset.scale + tOffset.offsetX;
      const miniY = pt.y * tOffset.scale + tOffset.offsetY;
      const back = miniPointToBoard({ x: miniX, y: miniY }, tOffset);
      expect(back.x).toBeCloseTo(pt.x, 8);
      expect(back.y).toBeCloseTo(pt.y, 8);
    }
  });
});
