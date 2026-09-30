import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '@/lib/api-client';
import * as boardsHooks from '@/features/boards/hooks/use-boards';
import { BoardPage } from './board-page';

vi.mock('@/features/boards/hooks/use-boards', () => ({ useBoard: vi.fn() }));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => ({ user: null }) }));

type BoardQuery = ReturnType<typeof boardsHooks.useBoard>;

function mockQuery(partial: Partial<BoardQuery>): { refetch: ReturnType<typeof vi.fn> } {
  const refetch = vi.fn();
  vi.mocked(boardsHooks.useBoard).mockReturnValue({
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch,
    ...partial,
  } as unknown as BoardQuery);
  return { refetch };
}

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={['/app/board/b1']}>
      <Routes>
        <Route path="/app/board/:boardId" element={<BoardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BoardPage access gate', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a loading skeleton, not the editor, while the board loads', () => {
    mockQuery({ isPending: true });
    renderPage();
    expect(screen.getByRole('status', { name: /loading board/i })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
  });

  it('shows a forbidden screen with a way back for a 403', () => {
    mockQuery({ isError: true, error: new ApiError(403, 'Forbidden') });
    renderPage();
    expect(screen.getByRole('heading', { name: /don.t have access/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to boards/i })).toHaveAttribute('href', '/app');
  });

  it('shows a not-found screen for a 404', () => {
    mockQuery({ isError: true, error: new ApiError(404, 'Not found') });
    renderPage();
    expect(screen.getByRole('heading', { name: /board not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to boards/i })).toHaveAttribute('href', '/app');
  });

  it('offers a retry for any other failure', () => {
    const { refetch } = mockQuery({ isError: true, error: new ApiError(500, 'Boom') });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
