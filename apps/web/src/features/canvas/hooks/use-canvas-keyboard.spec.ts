import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { addElements } from '../model/commands';
import { createCanvasStore, type CanvasStore } from '../engine/canvas-store';
import { pasteCopiedElements, useCanvasKeyboard } from './use-canvas-keyboard';

const rect = (id: string): CanvasElement =>
  ({
    id,
    type: 'rect',
    x: 100,
    y: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 2,
  }) as CanvasElement;

function press(key: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

function mounted(): CanvasStore {
  const store = createCanvasStore('local');
  renderHook(() => useCanvasKeyboard(store));
  return store;
}

describe('useCanvasKeyboard arrow keys', () => {
  beforeEach(() => localStorage.clear());

  it('nudges the selection by one pixel', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setSelected(['a']);
    press('ArrowRight');
    expect(store.getState().doc.elements['a']?.x).toBe(101);
    press('ArrowUp');
    expect(store.getState().doc.elements['a']?.y).toBe(99);
  });

  it('nudges by a larger step when shift is held', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setSelected(['a']);
    press('ArrowDown', { shiftKey: true });
    expect(store.getState().doc.elements['a']?.y).toBe(110);
  });

  it('leaves the viewport alone while nudging', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setSelected(['a']);
    const before = store.getState().view;
    press('ArrowLeft');
    expect(store.getState().view).toEqual(before);
  });

  it('makes the nudge undoable as a single step', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setSelected(['a']);
    press('ArrowRight');
    store.getState().undo();
    expect(store.getState().doc.elements['a']?.x).toBe(100);
  });

  it('pans the viewport when nothing is selected', () => {
    const store = mounted();
    press('ArrowRight');
    expect(store.getState().view.x).toBe(-64);
    press('ArrowUp');
    expect(store.getState().view.y).toBe(64);
  });

  it('pans further when shift is held', () => {
    const store = mounted();
    press('ArrowDown', { shiftKey: true });
    expect(store.getState().view.y).toBe(-256);
  });
});

describe('useCanvasKeyboard select all', () => {
  beforeEach(() => localStorage.clear());

  it('selects every element on ctrl+a', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a'), rect('b'), rect('c')]));
    press('a', { ctrlKey: true });
    expect(store.getState().selected.sort()).toEqual(['a', 'b', 'c']);
  });

  it('selects every element on cmd+a', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a'), rect('b')]));
    press('a', { metaKey: true });
    expect(store.getState().selected.sort()).toEqual(['a', 'b']);
  });

  it('replaces an existing selection rather than adding to it', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a'), rect('b')]));
    store.getState().setSelected(['a']);
    press('a', { ctrlKey: true });
    expect(store.getState().selected.sort()).toEqual(['a', 'b']);
  });

  it('ignores a bare "a" so typing near the canvas cannot select the board', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a')]));
    press('a');
    expect(store.getState().selected).toEqual([]);
  });

  it('stops the browser selecting the page text instead', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a')]));
    const evt = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('leaves ctrl+a to the field when the user is typing', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a')]));
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    input.focus();
    try {
      const evt = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(evt);
      expect(store.getState().selected).toEqual([]);
      expect(evt.defaultPrevented).toBe(false);
    } finally {
      input.remove();
    }
  });

  it('does nothing on an empty board', () => {
    const store = mounted();
    press('a', { ctrlKey: true });
    expect(store.getState().selected).toEqual([]);
  });

  it('stays out of the way during a presentation', () => {
    const store = createCanvasStore('local');
    renderHook(() =>
      useCanvasKeyboard(store, { presenting: true, onNext() {}, onPrev() {}, onExit() {} }),
    );
    store.getState().dispatch(addElements([rect('a')]));
    press('a', { ctrlKey: true });
    expect(store.getState().selected).toEqual([]);
  });
});

describe('useCanvasKeyboard copy/paste, delete and focus', () => {
  beforeEach(() => localStorage.clear());

  it('pasted connectors do not stay bound to the originals', () => {
    const store = mounted();
    const a = { ...rect('a'), width: 100, height: 100 } as CanvasElement;
    const b = { ...rect('b'), x: 400, width: 100, height: 100 } as CanvasElement;
    const conn = { ...rect('c'), type: 'connector', x: 0, y: 0, from: { elementId: 'a' }, to: { elementId: 'b' } } as CanvasElement;
    store.getState().dispatch(addElements([a, b, conn]));
    store.getState().setSelected(['a', 'c']);
    press('c', { ctrlKey: true });
    pasteCopiedElements(store);
    const pasted = store.getState().selected.map((id) => store.getState().doc.elements[id]!);
    const pa = pasted.find((e) => e.type === 'rect')!;
    const pc = pasted.find((e) => e.type === 'connector')!;
    expect(pc.from?.elementId).toBe(pa.id);
    expect(pc.to?.elementId).toBeUndefined();
    expect(typeof pc.to?.x).toBe('number');
  });

  it('leaves ctrl+v to the browser so its paste event carries the system clipboard', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setSelected(['a']);
    press('c', { ctrlKey: true });
    const evt = new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    expect(Object.keys(store.getState().doc.elements)).toEqual(['a']);
    expect(pasteCopiedElements(store)).toBe(true);
    expect(Object.keys(store.getState().doc.elements)).toHaveLength(2);
  });

  it('Delete skips locked elements', () => {
    const store = mounted();
    store.getState().dispatch(addElements([{ ...rect('a'), locked: true } as CanvasElement, rect('b')]));
    store.getState().setSelected(['a', 'b']);
    press('Delete');
    expect(store.getState().doc.elements.a).toBeDefined();
    expect(store.getState().doc.elements.b).toBeUndefined();
  });

  it('Delete survives a mind-map parent cycle', () => {
    const store = mounted();
    const n1 = { ...rect('n1'), type: 'mindnode', parentId: 'n2' } as CanvasElement;
    const n2 = { ...rect('n2'), type: 'mindnode', parentId: 'n1' } as CanvasElement;
    store.getState().dispatch(addElements([n1, n2]));
    store.getState().setSelected(['n1']);
    press('Delete');
    expect(Object.keys(store.getState().doc.elements)).toEqual([]);
  });

  it('letter keys do not switch tools while a select has focus', () => {
    const store = mounted();
    const select = document.createElement('select');
    document.body.appendChild(select);
    select.focus();
    press('r');
    expect(store.getState().tool).toBe('select');
    select.remove();
  });
});

describe('useCanvasKeyboard nudging arrows and viewer deletes', () => {
  beforeEach(() => localStorage.clear());

  it('nudges a free arrow by its end points', () => {
    const store = mounted();
    const arrow = {
      ...rect('c'),
      type: 'connector',
      x: 0,
      y: 0,
      from: { x: 0, y: 0 },
      to: { x: 50, y: 0 },
    } as CanvasElement;
    store.getState().dispatch(addElements([arrow]));
    store.getState().setSelected(['c']);
    press('ArrowRight', { shiftKey: true });
    expect(store.getState().doc.elements['c']).toMatchObject({ from: { x: 10, y: 0 }, to: { x: 60, y: 0 } });
  });

  it('a viewer pressing Delete keeps both the element and the selection', () => {
    const store = mounted();
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setSelected(['a']);
    store.getState().setReadOnly(true);
    press('Delete');
    expect(store.getState().doc.elements['a']).toBeDefined();
    expect(store.getState().selected).toEqual(['a']);
  });

  it('deleting one of two group members dissolves the group (one undo restores both)', () => {
    const store = mounted();
    store.getState().dispatch(
      addElements([
        { ...rect('a'), groupPath: ['G'], groupId: 'G' },
        { ...rect('b'), groupPath: ['G'], groupId: 'G' },
      ]),
    );
    store.getState().setSelected(['a']);
    press('Delete');
    expect(store.getState().doc.elements['b']?.groupId).toBeUndefined();
    store.getState().undo();
    expect(store.getState().doc.elements['a']).toBeDefined();
    expect(store.getState().doc.elements['b']?.groupId).toBe('G');
  });
});
