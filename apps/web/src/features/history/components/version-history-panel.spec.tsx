import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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

const at = '2026-01-01T00:00:00.000Z';
const versions: BoardVersion[] = [
  { docVersion: 4, reason: 'manual', createdBy: 'me-123456789', createdByName: 'Ada', createdAt: at },
  { docVersion: 3, reason: 'restore', createdBy: 'other-987654321', createdByName: 'Grace', createdAt: at },
  { docVersion: 2, reason: 'manual', createdBy: 'gone-555555555', createdByName: null, createdAt: at },
  { docVersion: 1, reason: 'autosave', createdBy: null, createdByName: null, createdAt: at },
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
    expect(screen.getByText(/· Grace$/)).toBeInTheDocument();
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

  it('portals out of transformed ancestors to document.body', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <div data-testid="transformed" style={{ transform: 'translateZ(0)' }}>
          <VersionHistoryPanel boardId="b1" open onClose={vi.fn()} />
        </div>
      </QueryClientProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: /version history/i });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByTestId('transformed')).not.toContainElement(dialog);
  });

  it('confirms a restore inline instead of window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    vi.mocked(historyApi.restoreVersion).mockResolvedValue({ ok: true, docVersion: 3 });
    renderPanel(true);
    const restore = await screen.findByRole('button', { name: /restore version #3/i });
    const row = restore.closest('li');
    if (!row) throw new Error('version row not found');
    await userEvent.click(restore);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(historyApi.restoreVersion).not.toHaveBeenCalled();

    expect(within(row).getByText(/revert to this snapshot for everyone/i)).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: /confirm restore version #3/i }));
    expect(historyApi.restoreVersion).toHaveBeenCalledWith('b1', 3);
    confirmSpy.mockRestore();
  });

  it('cancelling a restore focuses Cancel first, then returns focus to Restore', async () => {
    renderPanel(true);
    await userEvent.click(await screen.findByRole('button', { name: /restore version #3/i }));
    const cancel = screen.getByRole('button', { name: /cancel/i });
    expect(cancel).toHaveFocus();
    await userEvent.click(cancel);
    expect(historyApi.restoreVersion).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /restore version #3/i })).toHaveFocus();
  });
});
