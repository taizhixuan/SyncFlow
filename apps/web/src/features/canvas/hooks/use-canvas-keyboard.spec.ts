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
