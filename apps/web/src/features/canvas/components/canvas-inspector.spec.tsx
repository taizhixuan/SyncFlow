import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as authContext from '@/features/auth/auth-context';
import { createCanvasStore } from '../engine/canvas-store';
import { addElements } from '../model/commands';
import { createElement } from '../model/element';
import { SURFACE } from '../model/colors';
import { CanvasInspector } from './canvas-inspector';

vi.mock('@/features/auth/auth-context', async (importOriginal) => {
  const real = await importOriginal<typeof authContext>();
  return { ...real, useAuth: vi.fn() };
});

function setup(): ReturnType<typeof createCanvasStore> {
  localStorage.clear();
  const store = createCanvasStore('inspector-test');
  render(<CanvasInspector store={store} onOpenComments={() => {}} />);
  return store;
}

function addRect(store: ReturnType<typeof createCanvasStore>): string {
  // Store writes outside React; callers in a test body wrap them in act().
  const el = { ...createElement('rect', { x: 10, y: 20 }, 0, store.getState().activeStyle), width: 100, height: 50 };
  store.getState().dispatch(addElements([el]));
  store.getState().setSelected([el.id]);
  return el.id;
}

describe('CanvasInspector', () => {
  beforeEach(() => {
    vi.mocked(authContext.useAuth).mockReturnValue({ user: null } as unknown as ReturnType<typeof authContext.useAuth>);
  });
  afterEach(() => cleanup());

  it('styles the next shape when nothing is selected, defaulting to a theme surface fill', () => {
    const store = setup();
    expect(screen.getByRole('heading', { name: 'Next shape' })).toBeInTheDocument();
    expect(store.getState().activeStyle.fill).toBe(SURFACE);
    expect(screen.getByRole('button', { name: 'Fill surface' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies a fill to the selection and to the next shape', async () => {
    const store = setup();
    let id = '';
    act(() => {
      id = addRect(store);
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Fill none' }));
    expect(store.getState().doc.elements[id]?.fill).toBeNull();
    expect(store.getState().activeStyle.fill).toBeNull();
  });

  it('edits exact geometry from the layout fields', async () => {
    const store = setup();
    let id = '';
    act(() => {
      id = addRect(store);
    });
    const width = await screen.findByRole('spinbutton', { name: 'Width' });
    await userEvent.clear(width);
    await userEvent.type(width, '240{Enter}');
    expect(store.getState().doc.elements[id]?.width).toBe(240);
    const x = screen.getByRole('spinbutton', { name: 'X position' });
    await userEvent.clear(x);
    await userEvent.type(x, 'abc{Enter}');
    expect(store.getState().doc.elements[id]?.x).toBe(10);
  });

  it('deletes the selection from the arrange row', async () => {
    const store = setup();
    let id = '';
    act(() => {
      id = addRect(store);
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(store.getState().doc.elements[id]).toBeUndefined();
    expect(store.getState().selected).toEqual([]);
  });

  it('hides every editing control from viewers', () => {
    const store = setup();
    act(() => {
      addRect(store);
      store.getState().setReadOnly(true);
    });
    expect(screen.queryByRole('button', { name: /fill/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
