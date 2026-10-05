import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createCanvasStore } from '../engine/canvas-store';
import { CanvasTopBar } from './canvas-top-bar';

function renderBar(connection: 'offline' | 'connecting' | 'live', badge?: string): void {
  localStorage.clear();
  render(
    <MemoryRouter>
      <CanvasTopBar store={createCanvasStore('b1')} title="Board" connection={connection} badge={badge} />
    </MemoryRouter>,
  );
}

describe('CanvasTopBar connection status', () => {
  afterEach(() => cleanup());

  it.each([
    ['offline', /offline/i],
    ['connecting', /reconnecting/i],
    ['live', /live/i],
  ] as const)('always shows the %s state, including on mobile widths', (connection, name) => {
    renderBar(connection);
    const status = screen.getByRole('status', { name });
    // The pill itself must never be display:none below `sm`; only its text may be.
    expect(status.className.split(/\s+/)).not.toContain('hidden');
    expect(status.textContent ?? '').not.toMatch(/[●○]/);
  });

  it('does not claim the local scratch board is offline', () => {
    renderBar('offline', 'local');
    expect(screen.queryByRole('status', { name: /connection/i })).toBeNull();
  });
});

describe('CanvasTopBar member actions', () => {
  afterEach(() => cleanup());

  it('offers Leave board only when the page passes a handler', () => {
    localStorage.clear();
    const { rerender } = render(
      <MemoryRouter>
        <CanvasTopBar store={createCanvasStore('b1')} title="Board" />
      </MemoryRouter>,
    );
    expect(screen.queryAllByRole('button', { name: /leave board/i })).toHaveLength(0);
    rerender(
      <MemoryRouter>
        <CanvasTopBar store={createCanvasStore('b1')} title="Board" onLeaveBoard={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('button', { name: /leave board/i }).length).toBeGreaterThan(0);
  });

  it('hides the vote toggle from viewers, who cannot vote', () => {
    localStorage.clear();
    const store = createCanvasStore('b1');
    store.getState().setReadOnly(true);
    render(
      <MemoryRouter>
        <CanvasTopBar store={store} title="Board" />
      </MemoryRouter>,
    );
    expect(screen.queryAllByRole('button', { name: /vote/i })).toHaveLength(0);
  });
});

describe('CanvasTopBar board badge', () => {
  afterEach(() => cleanup());

  it('shows the view-only badge at every width, as an announced status', () => {
    renderBar('live', 'view only');
    const badge = screen.getByRole('status', { name: /board mode: view only/i });
    expect(badge.className.split(/\s+/)).not.toContain('hidden');
  });
});

describe('CanvasTopBar title rename', () => {
  afterEach(() => cleanup());

  it('does not rename on the Enter that confirms an IME candidate', () => {
    localStorage.clear();
    const onRename = vi.fn();
    render(
      <MemoryRouter>
        <CanvasTopBar store={createCanvasStore('b1')} title="Board" connection="live" onRenameTitle={onRename} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    const input = screen.getByRole('textbox', { name: /board title/i });
    fireEvent.change(input, { target: { value: 'にほん' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
    expect(document.activeElement).toBe(input);
    expect(onRename).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('にほん');
  });
});
