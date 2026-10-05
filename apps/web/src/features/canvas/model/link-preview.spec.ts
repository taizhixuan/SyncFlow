import { describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { withLinkPreview } from './link-preview';
import { resolveConnector } from './connector';

const rect = (id: string, x: number): CanvasElement =>
  ({ id, type: 'rect', x, y: 0, width: 100, height: 60, rotation: 0, opacity: 1, zIndex: 0 }) as CanvasElement;

describe('withLinkPreview', () => {
  it('is the board itself when nothing is being resized', () => {
    const els = { a: rect('a', 0) };
    expect(withLinkPreview(els, null)).toBe(els);
  });

  it('lets a bound arrow follow a shape mid-resize', () => {
    const els: Record<string, CanvasElement> = {
      a: rect('a', 0),
      b: rect('b', 300),
      c: { id: 'c', type: 'connector', x: 0, y: 0, from: { elementId: 'a' }, to: { elementId: 'b' } } as CanvasElement,
    };
    const before = resolveConnector(els.c!, els).from;
    // a is being dragged wider by its right handle.
    const preview = withLinkPreview(els, { a: { width: 200 } });
    expect(resolveConnector(els.c!, preview).from.x).toBe(200);
    expect(before.x).toBe(100);
    // The board itself is untouched: only the links see the preview.
    expect(els.a!.width).toBe(100);
  });
});
