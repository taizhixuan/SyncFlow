import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createCanvasStore } from '../engine/canvas-store';
import { CommentsPanel } from './comments-panel';
import { TemplatesDrawer } from './templates-drawer';
import { ComponentLibrary } from './component-library';

type PanelRender = (open: boolean, onClose: () => void) => JSX.Element;

const store = (): ReturnType<typeof createCanvasStore> => {
  localStorage.clear();
  return createCanvasStore('local');
};

const panels: Array<[string, PanelRender]> = [
  ['Comments', (open, onClose) => <CommentsPanel store={store()} open={open} onClose={onClose} />],
  [
    'Board templates',
    (open, onClose) => (
      <TemplatesDrawer store={store()} open={open} onClose={onClose} insertOrigin={{ x: 0, y: 0 }} />
    ),
  ],
  [
    'Component library',
    (open, onClose) => (
      <ComponentLibrary store={store()} open={open} onClose={onClose} insertOrigin={{ x: 0, y: 0 }} />
    ),
  ],
];

describe.each(panels)('%s panel focus management', (label, renderPanel) => {
  afterEach(() => cleanup());

  it('moves focus in on open, closes on Escape and hands focus back', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();

    const { rerender } = render(renderPanel(true, onClose));
    const dialog = screen.getByRole('dialog', { name: label });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(renderPanel(false, onClose));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('renders no text glyphs as icons in its close button', () => {
    render(renderPanel(true, () => {}));
    const close = screen.getByRole('button', { name: /close/i });
    expect(close.textContent).toBe('');
    expect(close.querySelector('svg')).not.toBeNull();
  });
});
