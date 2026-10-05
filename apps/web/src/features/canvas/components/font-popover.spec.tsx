import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createCanvasStore } from '../engine/canvas-store';
import { addElements } from '../model/commands';
import { createElement } from '../model/element';
import { FontPopover } from './font-popover';

function setup(): { store: ReturnType<typeof createCanvasStore>; id: string; input: HTMLInputElement } {
  localStorage.clear();
  const store = createCanvasStore('font-popover-test');
  const el = { ...createElement('text', { x: 0, y: 0 }, 0, store.getState().activeStyle), fontSize: 16 };
  act(() => {
    store.getState().dispatch(addElements([el]));
    store.getState().setSelected([el.id]);
  });
  render(<FontPopover store={store} />);
  fireEvent.click(screen.getByRole('button', { name: 'Text and font' }));
  const input = screen.getByRole('spinbutton', { name: 'Font size' }) as HTMLInputElement;
  return { store, id: el.id, input };
}

describe('FontPopover size field', () => {
  afterEach(() => cleanup());

  it('lets a size be typed digit by digit and saves it on Enter', () => {
    const { store, id, input } = setup();
    input.focus();
    fireEvent.change(input, { target: { value: '3' } });
    // A half-typed "3" is neither clamped to 8 nor written to the board.
    expect(input.value).toBe('3');
    expect(store.getState().doc.elements[id]?.fontSize).toBe(16);
    fireEvent.change(input, { target: { value: '32' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(store.getState().doc.elements[id]?.fontSize).toBe(32);
  });

  it('saves on blur, clamped to the allowed range', () => {
    const { store, id, input } = setup();
    input.focus();
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.blur(input);
    expect(store.getState().doc.elements[id]?.fontSize).toBe(200);
    expect(input.value).toBe('200');
  });

  it('reverts on Escape without saving', () => {
    const { store, id, input } = setup();
    input.focus();
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(store.getState().doc.elements[id]?.fontSize).toBe(16);
    expect(input.value).toBe('16');
  });

  it('drops a cleared field instead of saving a zero', () => {
    const { store, id, input } = setup();
    input.focus();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(store.getState().doc.elements[id]?.fontSize).toBe(16);
    expect(input.value).toBe('16');
  });
});
