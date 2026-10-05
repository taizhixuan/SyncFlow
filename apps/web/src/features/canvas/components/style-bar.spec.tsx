import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createCanvasStore } from '../engine/canvas-store';
import { addElements } from '../model/commands';
import { createElement } from '../model/element';
import { StyleBar } from './style-bar';

describe('StyleBar tag input', () => {
  afterEach(() => cleanup());

  it('does not add a tag on the Enter that confirms an IME candidate', () => {
    localStorage.clear();
    const store = createCanvasStore('style-bar-test');
    const el = createElement('rect', { x: 0, y: 0 }, 0, store.getState().activeStyle);
    act(() => {
      store.getState().dispatch(addElements([el]));
      store.getState().setSelected([el.id]);
    });
    render(<StyleBar store={store} />);
    const tag = screen.getByRole('textbox', { name: 'Add tag to selected elements' });
    fireEvent.change(tag, { target: { value: 'にほ' } });
    fireEvent.keyDown(tag, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(store.getState().doc.elements[el.id]?.tags ?? []).toEqual([]);
    fireEvent.keyDown(tag, { key: 'Enter' });
    expect(store.getState().doc.elements[el.id]?.tags).toEqual(['にほ']);
  });
});
