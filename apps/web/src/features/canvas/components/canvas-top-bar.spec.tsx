import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
