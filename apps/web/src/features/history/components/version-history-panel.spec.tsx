import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Board, BoardVersion, UserPublic } from '@syncflow/shared';
import * as authContext from '@/features/auth/auth-context';
import * as boardsApi from '@/features/boards/api/boards-api';
import * as historyApi from '../api/history-api';
import { VersionHistoryPanel } from './version-history-panel';

vi.mock('../api/history-api');
vi.mock('@/features/boards/api/boards-api');
vi.mock('@/features/auth/auth-context', async (importOriginal) => {
  const real = await importOriginal<typeof authContext>();
  return { ...real, useAuth: vi.fn() };
});

const versions: BoardVersion[] = [
  { docVersion: 3, reason: 'manual', createdBy: 'me-123456789', createdAt: '2026-01-01T00:00:00.000Z' },
  { docVersion: 2, reason: 'restore', createdBy: 'other-987654321', createdAt: '2026-01-01T00:00:00.000Z' },
  { docVersion: 1, reason: 'autosave', createdBy: null, createdAt: '2026-01-01T00:00:00.000Z' },
];

function renderPanel(open: boolean, onClose = vi.fn()): void {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <button>History</button>
      <VersionHistoryPanel boardId="b1" open={open} onClose={onClose} />
    </QueryClientProvider>,
  );
}

describe('VersionHistoryPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'authenticated',
      user: { id: 'me-123456789', displayName: 'Ada' } as UserPublic,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      retry: vi.fn(),
    });
    vi.mocked(boardsApi.getBoard).mockResolvedValue({ id: 'b1', role: 'editor' } as Board);
    vi.mocked(historyApi.listVersions).mockResolvedValue(versions);
  });

  it('does not fetch versions while closed', () => {
    renderPanel(false);
    expect(historyApi.listVersions).not.toHaveBeenCalled();
  });

  it('labels authors readably instead of raw id prefixes', async () => {
    renderPanel(true);
    expect(await screen.findByText(/· You$/)).toBeInTheDocument();
    expect(screen.getByText(/· Automatic$/)).toBeInTheDocument();
    expect(screen.getByText(/· A collaborator$/)).toBeInTheDocument();
    expect(screen.queryByText(/other-98/)).not.toBeInTheDocument();
  });

  it('uses an icon close button, closes on Escape, and fits a phone', async () => {
    const onClose = vi.fn();
    renderPanel(true, onClose);
    const close = screen.getByRole('button', { name: /close version history/i });
    expect(close.textContent).toBe('');
    expect(close.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('dialog')).toHaveClass('w-full', 'sm:w-80');
    expect(close).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
