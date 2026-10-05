import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { createCanvasStore } from '../engine/canvas-store';
import { SaveStatus } from './save-status';

describe('SaveStatus', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('says the board is saved on this device normally', () => {
    render(<SaveStatus store={createCanvasStore('save-status-spec')} isLocal />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved on this device');
  });

  it("doesn't claim the board is saved when the last save failed", () => {
    // The notice said "couldn't save" while this still read "Saved on this device".
    const store = createCanvasStore('save-status-spec');
    render(<SaveStatus store={store} isLocal />);
    act(() => store.setState({ saveError: 'storage full' }));
    expect(screen.getByRole('status')).toHaveTextContent('Not saved');
    expect(screen.getByRole('status')).not.toHaveTextContent(/saved on this device/i);
  });
});
