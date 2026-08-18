/**
 * Regression cover for the interaction between viewport culling and the
 * selection Transformer.
 *
 * Unlike the other canvas specs this one renders a REAL Konva stage rather than
 * mocking react-konva, because the bug is entirely about timing: the Transformer
 * resolves its targets through a mutable ref that ref callbacks populate during
 * the commit, and culling means selecting everything mounts nodes that did not
 * exist a moment earlier. A mocked renderer has no refs to attach and no commit
 * ordering, so it cannot express the failure at all.
 *
 * Konva needs a 2D context, which jsdom does not provide. Rather than pull in
 * the native `canvas` package, the context is stubbed with a Proxy of no-ops —
 * nothing here asserts on pixels, only on which nodes the Transformer holds.
 */
import { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { CanvasElement } from '@syncflow/shared';

// ── environment stubs, installed before Konva is imported ────────────────────

const context2d = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'measureText') {
        return () => ({ width: 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 });
      }
      if (prop === 'getImageData') {
        return () => ({ data: new Uint8ClampedArray(4) });
      }
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      if (prop === 'createPattern') return () => null;
      // Every other access is either a drawing call or a style property; a
      // no-op function satisfies both, and writes are swallowed by `set`.
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
const { CULL_MIN_ELEMENTS } = await import('../model/culling');

// ── helpers ──────────────────────────────────────────────────────────────────

/** Enough elements to switch culling on, all parked far off screen. */
function farAwayElements(count: number): CanvasElement[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        id: 'el-' + i,
        type: 'rect',
        x: 50_000 + i * 200,
        y: 50_000,
        width: 100,
        height: 60,
        rotation: 0,
        opacity: 1,
        zIndex: i,
        fill: null,
        stroke: 'auto',
        strokeWidth: 2,
        strokeStyle: 'solid',
      }) as CanvasElement,
  );
}

type Stage = { find(selector: string): Array<{ id(): string; nodes?(): unknown[] }> };

function mountedIds(stage: Stage): string[] {
  return stage.find('.element').map((g) => g.id());
}

function transformerTargets(stage: Stage): number {
  const tr = stage.find('Transformer')[0] as { nodes(): unknown[] } | undefined;
  return tr ? tr.nodes().length : 0;
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('culling and the selection Transformer', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('attaches the Transformer to elements that culling had unmounted', async () => {
    const store = createCanvasStore('local');
    const count = CULL_MIN_ELEMENTS + 40;
    const elements = farAwayElements(count);

    let stage: Stage | null = null;
    await act(async () => {
      render(<CanvasStage store={store} onStageMount={(s) => { stage = s as unknown as Stage; }} />);
    });
    await act(async () => {
      store.getState().dispatch(addElements(elements));
    });

    expect(stage).not.toBeNull();
    const beforeSelect = mountedIds(stage!);
    // Everything is parked far from the origin, so culling drops the lot.
    expect(beforeSelect.length).toBeLessThan(count);

    await act(async () => {
      store.getState().setSelected(elements.map((e) => e.id));
    });

    // Selecting un-culls them...
    expect(mountedIds(stage!).length).toBe(count);
    // ...and the Transformer must hold every one, not just whatever happened to
    // be mounted when the selection changed. This is the regression: it used to
    // attach only to the already-mounted subset and stay that way.
    expect(transformerTargets(stage!)).toBe(count);
  });

  it('releases them again when the selection is cleared', async () => {
    const store = createCanvasStore('local');
    const elements = farAwayElements(CULL_MIN_ELEMENTS + 10);

    let stage: Stage | null = null;
    await act(async () => {
      render(<CanvasStage store={store} onStageMount={(s) => { stage = s as unknown as Stage; }} />);
    });
    await act(async () => {
      store.getState().dispatch(addElements(elements));
      store.getState().setSelected(elements.map((e) => e.id));
    });
    expect(transformerTargets(stage!)).toBe(elements.length);

    await act(async () => {
      store.getState().setSelected([]);
    });

    expect(transformerTargets(stage!)).toBe(0);
    expect(mountedIds(stage!).length).toBeLessThan(elements.length);
  });
});
