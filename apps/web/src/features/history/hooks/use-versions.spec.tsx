import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as historyApi from '../api/history-api';
import { useVersions } from './use-versions';

vi.mock('../api/history-api');

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useVersions', () => {
  it('does not fetch while the history panel is closed', () => {
    vi.mocked(historyApi.listVersions).mockResolvedValue([]);
    renderHook(() => useVersions('b1', false), { wrapper });
    expect(historyApi.listVersions).not.toHaveBeenCalled();
  });

  it('fetches once the panel opens', async () => {
    vi.mocked(historyApi.listVersions).mockResolvedValue([]);
    renderHook(() => useVersions('b1', true), { wrapper });
    await waitFor(() => expect(historyApi.listVersions).toHaveBeenCalledWith('b1'));
  });

  it('never fetches for the local scratch board', () => {
    vi.mocked(historyApi.listVersions).mockClear();
    renderHook(() => useVersions('local', true), { wrapper });
    expect(historyApi.listVersions).not.toHaveBeenCalled();
  });
});
