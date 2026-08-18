import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CanvasElement } from '@syncflow/shared';
import { addElements } from '../model/commands';
import { createCanvasStore, type CanvasStore } from '../engine/canvas-store';
import { useCanvasKeyboard } from './use-canvas-keyboard';

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
