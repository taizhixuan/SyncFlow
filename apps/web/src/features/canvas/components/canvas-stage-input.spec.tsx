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
const { useCanvasKeyboard } = await import('../hooks/use-canvas-keyboard');

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

/** A paste carrying `data` (MIME type → string). jsdom has no ClipboardEvent/DataTransfer. */
function pasteData(target: EventTarget, data: Record<string, string>): Event {
  const ev = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'clipboardData', {
    value: {
      types: Object.keys(data),
      items: Object.keys(data).map((type) => ({
        type,
        kind: 'string',
        getAsFile: () => null,
        getAsString: (cb: (s: string) => void) => cb(data[type]!),
      })),
      getData: (type: string) => data[type] ?? '',
    },
  });
  target.dispatchEvent(ev);
  return ev;
}

function pasteText(target: EventTarget, text: string): void {
  pasteData(target, { 'text/plain': text });
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

  it('says so when the board could not be saved in the browser, until dismissed', async () => {
    const { store } = await mount();
    await act(async () => {
      store.setState({ saveError: 'Storage is full.' } as never);
    });
    expect(screen.getByRole('alert').textContent).toContain('Storage is full.');
    // Unlike a one-off failure it does not time out: changes may be getting lost.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    });
    expect(store.getState().saveError).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('draws a shape started on a frame body instead of ignoring the press', async () => {
    const { store, stage } = await mount();
    await act(async () => {
      store.getState().dispatch(
        addElements([
          base('fr', { type: 'frame', width: 400, height: 300, name: 'Frame' } as Partial<CanvasElement>),
          // An ellipse's box covers the press point, but its curve does not:
          // Konva hit the frame, and that is what the tool must be told.
          base('el', { type: 'ellipse', width: 100, height: 100, zIndex: 1 } as Partial<CanvasElement>),
        ]),
      );
      store.getState().setTool('rect');
    });
    const frameNode = (stage() as unknown as { findOne(s: string): { getChildren(): Array<unknown> } }).findOne('#fr');
    const shape = frameNode.getChildren()[0];
    await act(async () => {
      const down = new MouseEvent('pointerdown', { clientX: 4, clientY: 4, buttons: 1 });
      stage().setPointersPositions(down);
      stage().fire('pointerdown', { evt: down, target: shape });
      const move = new MouseEvent('pointermove', { clientX: 150, clientY: 120, buttons: 1 });
      stage().setPointersPositions(move);
      stage().fire('pointermove', { evt: move });
      const up = new MouseEvent('pointerup', { clientX: 150, clientY: 120 });
      stage().fire('pointerup', { evt: up });
    });
    expect(count(store, 'rect')).toBe(1);
  });

  it('reports its measured size to the parent', async () => {
    const onSizeChange = vi.fn();
    await mount({ onSizeChange });
    expect(onSizeChange).toHaveBeenCalledWith(
      expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }),
    );
  });
});

/** CanvasStage plus the board keyboard shortcuts, as BoardPage mounts them. */
function StageWithKeys({ store }: { store: ReturnType<typeof createCanvasStore> }): JSX.Element {
  useCanvasKeyboard(store);
  return <CanvasStage store={store} />;
}

function key(target: EventTarget, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

describe('CanvasStage clipboard', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  async function withCopiedRect() {
    const store = createCanvasStore('local');
    await act(async () => {
      render(<StageWithKeys store={store} />);
    });
    await act(async () => {
      store.getState().dispatch(addElements([base('a')]));
      store.getState().setSelected(['a']);
    });
    await act(async () => {
      key(document.body, 'c', { ctrlKey: true });
    });
    return store;
  }

  it('leaves Ctrl+V to the browser so the paste event (and a screenshot) gets through', async () => {
    const store = await withCopiedRect();
    let ev: KeyboardEvent | null = null;
    await act(async () => {
      ev = key(document.body, 'v', { ctrlKey: true });
    });
    expect(ev!.defaultPrevented).toBe(false);
    expect(count(store, 'rect')).toBe(1);
  });

  it('pastes the copied elements when the system clipboard has nothing usable', async () => {
    const store = await withCopiedRect();
    await act(async () => {
      pasteData(document.body, { 'text/plain': 'just some words' });
    });
    expect(count(store, 'rect')).toBe(2);
    expect(store.getState().selected).toHaveLength(1);
    expect(store.getState().selected[0]).not.toBe('a');
  });

  it('prefers the board copy over an older link still on the system clipboard', async () => {
    const store = await withCopiedRect();
    // What the copy event wrote is what comes back on paste.
    const copy = new Event('copy', { bubbles: true, cancelable: true });
    const written: Record<string, string> = {};
    Object.defineProperty(copy, 'clipboardData', {
      value: { setData: (t: string, v: string) => (written[t] = v) },
    });
    await act(async () => {
      document.body.dispatchEvent(copy);
    });
    expect(copy.defaultPrevented).toBe(true);
    await act(async () => {
      pasteData(document.body, { ...written, 'text/plain': 'https://example.com' });
    });
    expect(count(store, 'rect')).toBe(2);
    expect(count(store, 'embed')).toBe(0);
  });

  it('still turns a pasted link into an embed card', async () => {
    const store = await withCopiedRect();
    await act(async () => {
      pasteData(document.body, { 'text/plain': 'https://example.com' });
    });
    expect(count(store, 'embed')).toBe(1);
    expect(count(store, 'rect')).toBe(1);
  });

  it('keeps a paste into a text field a plain text paste', async () => {
    const store = await withCopiedRect();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    let ev: Event | null = null;
    await act(async () => {
      key(input, 'v', { ctrlKey: true });
      ev = pasteData(input, { 'text/plain': 'hello' });
    });
    expect(ev!.defaultPrevented).toBe(false);
    expect(count(store, 'rect')).toBe(1);
  });

  it('does not paste on a view-only board', async () => {
    const store = await withCopiedRect();
    await act(async () => store.getState().setReadOnly(true));
    await act(async () => {
      pasteData(document.body, {});
    });
    expect(count(store, 'rect')).toBe(1);
  });
});

describe('CanvasStage drawing gestures', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  function pointer(type: string, x: number, y: number, buttons = 1): MouseEvent {
    return new MouseEvent(type, { clientX: x, clientY: y, buttons, bubbles: true });
  }
  function stageEvent(stage: KStage, type: string, x: number, y: number, buttons = 1): void {
    const evt = pointer(type, x, y, buttons);
    stage.setPointersPositions(evt);
    stage.fire(type, { evt });
  }

  it('commits a shape released off the canvas, over a floating bar', async () => {
    const { store, stage } = await mount();
    await act(async () => store.getState().setTool('rect'));
    await act(async () => {
      stageEvent(stage(), 'pointerdown', 10, 10);
      stageEvent(stage(), 'pointermove', 120, 90);
    });
    // The release lands on a toolbar above the stage, so only the window sees it.
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 130, 100, 0));
    });
    expect(count(store, 'rect')).toBe(1);
    expect(store.getState().tool).toBe('select');
  });

  it('commits once when the stage itself sees the release', async () => {
    const { store, stage } = await mount();
    await act(async () => store.getState().setTool('rect'));
    await act(async () => {
      stageEvent(stage(), 'pointerdown', 10, 10);
      stageEvent(stage(), 'pointermove', 120, 90);
      stageEvent(stage(), 'pointerup', 120, 90, 0);
      window.dispatchEvent(pointer('pointerup', 120, 90, 0));
    });
    expect(count(store, 'rect')).toBe(1);
  });

  it('ends a draft whose button came up where no event reached us', async () => {
    const { store, stage } = await mount();
    await act(async () => store.getState().setTool('ellipse'));
    await act(async () => {
      stageEvent(stage(), 'pointerdown', 10, 10);
      stageEvent(stage(), 'pointermove', 120, 90);
      // Back over the stage with no button held: the press is long over.
      stageEvent(stage(), 'pointermove', 200, 200, 0);
    });
    expect(count(store, 'ellipse')).toBe(1);
    await act(async () => {
      stageEvent(stage(), 'pointermove', 300, 300, 0);
    });
    const el = Object.values(store.getState().doc.elements).find((e) => e.type === 'ellipse')!;
    expect(el.width).toBe(110);
  });

  it('finishes a connector released off the canvas', async () => {
    const { store, stage } = await mount();
    await act(async () => store.getState().setTool('connector'));
    await act(async () => {
      stageEvent(stage(), 'pointerdown', 10, 10);
      stageEvent(stage(), 'pointermove', 200, 150);
    });
    await act(async () => {
      window.dispatchEvent(pointer('pointerup', 220, 160, 0));
    });
    expect(count(store, 'connector')).toBe(1);
    expect(store.getState().tool).toBe('select');
  });
});

describe('CanvasStage text editor', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  type KNode = { fire(name: string, evt?: unknown, bubble?: boolean): void };
  function node(stage: KStage, id: string): KNode {
    return (stage as unknown as { findOne(sel: string): KNode }).findOne('#' + id);
  }
  function editor(): HTMLTextAreaElement | null {
    return document.querySelector('textarea[data-canvas-editor]');
  }
  async function withRects() {
    const m = await mount();
    await act(async () => {
      m.store.getState().dispatch(
        addElements([base('a', { text: 'A' } as Partial<CanvasElement>), base('b', { x: 300, text: 'B' } as Partial<CanvasElement>)]),
      );
    });
    return m;
  }
  async function dblTap(stage: KStage, id: string): Promise<void> {
    await act(async () => node(stage, id).fire('dbltap', { evt: new Event('touchend') }, true));
  }

  it('is labelled for assistive tech', async () => {
    const { stage } = await withRects();
    await dblTap(stage(), 'a');
    expect(screen.getByRole('textbox', { name: /text/i })).toBe(editor());
  });

  it('turns with a rotated element, about the same top-left corner Konva uses', async () => {
    const { store, stage } = await mount();
    await act(async () => {
      store.getState().dispatch(addElements([base('r', { rotation: 30, text: 'R' } as Partial<CanvasElement>)]));
    });
    await dblTap(stage(), 'r');
    expect(editor()!.style.transform).toBe('rotate(30deg)');
    expect(editor()!.style.transformOrigin).toBe('top left');
  });

  it('keeps the first edit when another element is double-tapped', async () => {
    const { store, stage } = await withRects();
    await dblTap(stage(), 'a');
    fireEvent.change(editor()!, { target: { value: 'first' } });
    // A tap on the canvas does not move focus on touch, so no blur commits it.
    await dblTap(stage(), 'b');
    expect(store.getState().doc.elements.a?.text).toBe('first');
    expect(editor()!.value).toBe('B');
  });

  it('does not open in voting mode or with a drawing tool selected', async () => {
    const { store, stage } = await withRects();
    await act(async () => store.getState().setTool('rect'));
    await dblTap(stage(), 'a');
    expect(editor()).toBeNull();
    await act(async () => {
      store.getState().setTool('select');
      store.getState().toggleVotingMode();
    });
    await dblTap(stage(), 'a');
    expect(editor()).toBeNull();
  });

  it('closes when the board turns view-only mid-edit', async () => {
    const { store, stage } = await withRects();
    await dblTap(stage(), 'a');
    expect(editor()).not.toBeNull();
    await act(async () => store.getState().setReadOnly(true));
    expect(editor()).toBeNull();
  });

  it('does not commit on the Enter that confirms an IME candidate', async () => {
    const { store, stage } = await withRects();
    await dblTap(stage(), 'a');
    fireEvent.change(editor()!, { target: { value: 'にほ' } });
    fireEvent.keyDown(editor()!, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(editor()).not.toBeNull();
    expect(store.getState().doc.elements.a?.text).toBe('A');
    fireEvent.keyDown(editor()!, { key: 'Enter' });
    expect(editor()).toBeNull();
    expect(store.getState().doc.elements.a?.text).toBe('にほ');
  });

  it('finishing a mind-node edit with Enter does not also add a sibling', async () => {
    const { store } = await mount();
    await act(async () => {
      store.getState().dispatch(addElements([base('m', { type: 'mindnode', text: 'Root' } as Partial<CanvasElement>)]));
      store.getState().setSelected(['m']);
    });
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Tab' });
    });
    expect(count(store, 'mindnode')).toBe(2);
    const ta = editor()!;
    // In a browser React commits the edit (removing the editor) in a microtask
    // that runs before the window listener; focus is on the body by then.
    ta.addEventListener('keydown', () => ta.blur());
    await act(async () => {
      fireEvent.keyDown(ta, { key: 'Enter' });
    });
    expect(count(store, 'mindnode')).toBe(2);
  });

  it('a long-press inside the editor stays a text gesture, not a context menu', async () => {
    vi.useFakeTimers();
    const { stage } = await withRects();
    await dblTap(stage(), 'a');
    const ta = editor()!;
    const touch = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(touch, 'touches', { value: [{ clientX: 5, clientY: 5 }] });
    act(() => {
      ta.dispatchEvent(touch);
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(editor()).not.toBeNull();
  });
});

describe('CanvasStage image tool', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('forgets a picked file once the user switches to another tool', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const { store } = await mount();
    await act(async () => store.getState().setTool('image'));
    expect(click).toHaveBeenCalledTimes(1);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await act(async () => store.getState().setTool('rect'));
    await act(async () => store.getState().setTool('image'));
    // Coming back asks for a file again rather than dropping the old one.
    expect(click).toHaveBeenCalledTimes(2);
  });
});
