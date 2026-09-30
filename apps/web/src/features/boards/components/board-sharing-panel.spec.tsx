import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as invitesApi from '../api/invites-api';
import { BoardSharingPanel } from './board-sharing-panel';

vi.mock('../api/invites-api');

describe('BoardSharingPanel', () => {
  it('uses an icon close button, focuses it, closes on Escape, and fits a phone', async () => {
    vi.mocked(invitesApi.listInvites).mockResolvedValue([]);
    const onClose = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BoardSharingPanel boardId="b1" open onClose={onClose} />
      </QueryClientProvider>,
    );

    const close = screen.getByRole('button', { name: /close sharing panel/i });
    expect(close.textContent).toBe('');
    expect(close.querySelector('svg')).not.toBeNull();
    expect(close).toHaveFocus();
    expect(screen.getByRole('dialog')).toHaveClass('w-full', 'sm:w-96');

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
