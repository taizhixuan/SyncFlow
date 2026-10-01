import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CanvasElement } from '@syncflow/shared';
import { createCanvasStore } from '../engine/canvas-store';
import { addElements } from '../model/commands';
import { ContextMenu } from './context-menu';

function rect(id: string): CanvasElement {
  return {
    id,
    type: 'rect',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    fill: null,
    stroke: 'auto',
    strokeWidth: 1,
    strokeStyle: 'solid',
  } as CanvasElement;
}

function setup(ids: string[] = []) {
  localStorage.clear();
  const store = createCanvasStore('local');
  store.getState().dispatch(addElements([rect('a'), rect('b')]));
  const onClose = vi.fn();
  render(
    <ContextMenu x={0} y={0} ids={ids} store={store} onEditText={() => {}} onClose={onClose} />,
  );
  return { store, onClose };
}

describe('ContextMenu', () => {
  afterEach(() => cleanup());

  it('exposes items as menuitems and focuses the first on open', () => {
    setup();
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(items[0]);
  });

  it('runs an item on click (keyboard Enter/Space activate via click)', () => {
    const { store, onClose } = setup();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Select all' }));
    expect(store.getState().selected.sort()).toEqual(['a', 'b']);
    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus with the arrow keys and closes on Escape', () => {
    const { onClose } = setup(['a']);
    const items = screen.getAllByRole('menuitem');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('asks for confirmation before clearing the canvas', () => {
    const { store, onClose } = setup();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear canvas' }));
    expect(Object.keys(store.getState().doc.elements)).toHaveLength(2);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitem', { name: /click again to confirm/i }));
    expect(Object.keys(store.getState().doc.elements)).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows no menu when a viewer right-clicks elements, since nothing applies', () => {
    localStorage.clear();
    const store = createCanvasStore('local');
    store.getState().dispatch(addElements([rect('a')]));
    store.getState().setReadOnly(true);
    render(
      <ContextMenu x={0} y={0} ids={['a']} store={store} onEditText={() => {}} onClose={() => {}} />,
    );
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
