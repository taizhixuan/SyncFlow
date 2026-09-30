/**
 * Input-handling regressions for CanvasStage: window-level paste and keyboard
 * listeners must not hijack events meant for form controls, the laser tool
 * must not flood awareness, and a failed image upload must never silently
 * inline a huge data URL into the document.
 *
 * Renders a real Konva stage with the same no-op 2D context stub as the
 * culling spec (jsdom has no canvas).
 */
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CanvasElement } from '@syncflow/shared';

vi.mock('../api/upload-image', () => ({
  uploadImage: vi.fn(() => Promise.reject(new Error('storage down'))),
}));

const context2d = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === 'measureText') {
        return () => ({ width: 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 });
      }
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
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
const { CULL_MIN_ELEMENTS } = await import('../model/culling');

type KStage = {
  setPointersPositions(evt: unknown): void;
  fire(name: string, evt?: unknown): void;
  find(selector: string): Array<{ id(): string }>;
};

function base(id: string, extra: Partial<CanvasElement> = {}): CanvasElement {
  return {
    id,
    type: 'rect',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 1,
    strokeStyle: 'solid',
    ...extra,
  } as CanvasElement;
}

async function mount(props: Record<string, unknown> = {}) {
  const store = createCanvasStore('local');
  let stage: KStage | null = null;
  await act(async () => {
    render(
      <CanvasStage
        store={store}
        onStageMount={(s) => {
          stage = s as unknown as KStage;
        }}
        {...props}
      />,
    );
  });
  return { store, stage: () => stage! };
}

function pasteText(target: EventTarget, text: string): void {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', {
    value: { items: [{ type: 'text/plain', getAsString: (cb: (s: string) => void) => cb(text) }] },
  });
  target.dispatchEvent(ev);
}

function count(store: ReturnType<typeof createCanvasStore>, type: string): number {
  return Object.values(store.getState().doc.elements).filter((e) => e.type === type).length;
}

describe('CanvasStage input handling', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('does not turn a URL pasted into a text field into an embed card', async () => {
    const { store } = await mount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    await act(async () => pasteText(input, 'example.com'));
    expect(count(store, 'embed')).toBe(0);

    input.blur();
    await act(async () => pasteText(document.body, 'example.com'));
    expect(count(store, 'embed')).toBe(1);
  });

  it('ignores Enter/Tab while a control outside the canvas has focus', async () => {
    const { store } = await mount();
    await act(async () => {
      store.getState().dispatch(addElements([base('m', { type: 'mindnode', text: 'Root' } as Partial<CanvasElement>)]));
      store.getState().setSelected(['m']);
    });
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    await act(async () => {
      fireEvent.keyDown(button, { key: 'Enter' });
      fireEvent.keyDown(button, { key: 'Tab' });
    });
    expect(count(store, 'mindnode')).toBe(1);

    button.blur();
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Tab' });
    });
    expect(count(store, 'mindnode')).toBe(2);
  });

  it('only broadcasts a laser clear once, on leaving the laser tool', async () => {
    const onLaser = vi.fn();
    const { store, stage } = await mount({ onLaser });
    const move = (x: number): void => {
      stage().setPointersPositions(new MouseEvent('pointermove', { clientX: x, clientY: 5 }));
      stage().fire('pointermove', { evt: new MouseEvent('pointermove') });
    };

    await act(async () => {
      move(1);
      move(2);
    });
    expect(onLaser).not.toHaveBeenCalled();

    await act(async () => store.getState().setTool('laser'));
    await act(async () => move(3));
    expect(onLaser).toHaveBeenLastCalledWith(expect.objectContaining({ x: 3 }));

    await act(async () => store.getState().setTool('select'));
    await act(async () => {
      move(4);
      move(5);
    });
    expect(onLaser.mock.calls.filter(([p]) => p === null)).toHaveLength(1);
  });

  it('refuses to inline a large image when the upload fails and says so', async () => {
    const { store } = await mount();
    const big = new File([new Uint8Array(300 * 1024)], 'big.png', { type: 'image/png' });
    const container = document.querySelector('.touch-none')!;
    await act(async () => {
      fireEvent.drop(container, { dataTransfer: { files: [big] } });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(count(store, 'image')).toBe(0);
    expect(screen.getByRole('alert').textContent).toMatch(/image/i);
  });

  it('mounts every element while culling is suspended', async () => {
    const { store, stage } = await mount();
    const many = Array.from({ length: CULL_MIN_ELEMENTS + 20 }, (_, i) =>
      base('el-' + i, { x: 50_000 + i * 200, y: 50_000, zIndex: i }),
    );
    await act(async () => store.getState().dispatch(addElements(many)));
    expect(stage().find('.element').length).toBeLessThan(many.length);

    await act(async () => {
      store.setState({ cullingSuspended: true } as never);
    });
    expect(stage().find('.element').length).toBe(many.length);
  });

  it('reports its measured size to the parent', async () => {
    const onSizeChange = vi.fn();
    await mount({ onSizeChange });
    expect(onSizeChange).toHaveBeenCalledWith(
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
  });
});
