import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import * as boardsApi from './boards-api';
import * as invitesApi from './invites-api';
import * as membersApi from './members-api';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

describe('boards feature api', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.get).mockResolvedValue({ items: [], nextCursor: null });
  });

  it('pages the board list with a limit and an encoded cursor', async () => {
    await boardsApi.listBoards(null);
    expect(api.get).toHaveBeenLastCalledWith(`/boards?limit=${boardsApi.BOARDS_PAGE_SIZE}`);

    await boardsApi.listBoards('abc/+=');
    expect(api.get).toHaveBeenLastCalledWith(
      `/boards?limit=${boardsApi.BOARDS_PAGE_SIZE}&cursor=abc%2F%2B%3D`,
    );
  });

  it('pages members and invites', async () => {
    await membersApi.listMembers('b1', 'c1');
    expect(api.get).toHaveBeenLastCalledWith(
      `/boards/b1/members?limit=${membersApi.MEMBERS_PAGE_SIZE}&cursor=c1`,
    );
    await invitesApi.listInvites('b1', null);
    expect(api.get).toHaveBeenLastCalledWith(
      `/boards/b1/invites?limit=${invitesApi.INVITES_PAGE_SIZE}`,
    );
  });

  it('leaves a board via the members/me endpoint', async () => {
    await boardsApi.leaveBoard('b1');
    expect(api.del).toHaveBeenCalledWith('/boards/b1/members/me');
  });

  it('transfers ownership and adds members by email', async () => {
    await membersApi.transferOwnership('b1', 'u2');
    expect(api.post).toHaveBeenCalledWith('/boards/b1/transfer-ownership', { userId: 'u2' });

    await membersApi.addMember('b1', { email: 'a@b.co', role: 'editor' });
    expect(api.post).toHaveBeenCalledWith('/boards/b1/members', { email: 'a@b.co', role: 'editor' });
  });
});
