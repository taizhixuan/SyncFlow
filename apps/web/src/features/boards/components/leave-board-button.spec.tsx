import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from '@/app/router-future';
import * as boardsApi from '../api/boards-api';
import { LeaveBoardButton } from './leave-board-button';

vi.mock('../api/boards-api');

function renderButton(
  props: { initiallyConfirming?: boolean; onCancel?: () => void } = {},
): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/app/board/b1']} future={ROUTER_FUTURE}>
        <Routes>
          <Route
            path="/app/board/:id"
            element={<LeaveBoardButton boardId="b1" boardTitle="Roadmap" {...props} />}
          />
          <Route path="/app" element={<div data-testid="dashboard" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe('LeaveBoardButton', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('confirms inline, and cancel returns focus without leaving', async () => {
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: /leave board/i }));
    expect(screen.getByText(/leave .roadmap.\?/i)).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: /cancel/i });
    expect(cancel).toHaveFocus();

    await userEvent.click(cancel);
    expect(boardsApi.leaveBoard).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /leave board/i })).toHaveFocus();
  });

  it('leaves, refreshes the board list, and returns to the dashboard', async () => {
    vi.mocked(boardsApi.leaveBoard).mockResolvedValue(undefined);
    const client = renderButton();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await userEvent.click(screen.getByRole('button', { name: /leave board/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm leave roadmap/i }));

    expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
    expect(boardsApi.leaveBoard).toHaveBeenCalledWith('b1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['boards'] });
  });

  it('keeps the user on the board and says why when leaving fails', async () => {
    vi.mocked(boardsApi.leaveBoard).mockRejectedValue(new Error('boom'));
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: /leave board/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm leave roadmap/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t leave this board/i);
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });

  it('can open straight into the confirm step and hands Cancel to the caller', async () => {
    const onCancel = vi.fn();
    renderButton({ initiallyConfirming: true, onCancel });
    expect(screen.getByText(/leave .roadmap.\?/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
