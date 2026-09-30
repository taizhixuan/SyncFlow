import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BoardInviteSummary, BoardMember, UserPublic } from '@syncflow/shared';
import * as authContext from '@/features/auth/auth-context';
import * as invitesApi from '../api/invites-api';
import * as membersApi from '../api/members-api';
import { BoardSharingPanel } from './board-sharing-panel';

vi.mock('../api/invites-api');
vi.mock('../api/members-api');
vi.mock('@/features/auth/auth-context', async (importOriginal) => {
  const real = await importOriginal<typeof authContext>();
  return { ...real, useAuth: vi.fn() };
});

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const GRACE_ID = '22222222-2222-4222-8222-222222222222';

const members: BoardMember[] = [
  {
    userId: OWNER_ID,
    displayName: 'Ada',
    email: 'ada@example.com',
    color: '#000000',
    role: 'owner',
    acceptedAt: null,
  },
  {
    userId: GRACE_ID,
    displayName: 'Grace',
    email: 'grace@example.com',
    color: '#ffffff',
    role: 'viewer',
    acceptedAt: null,
  },
];

function renderPanel(onClose = vi.fn()): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <BoardSharingPanel boardId="b1" open onClose={onClose} />
    </QueryClientProvider>,
  );
  return client;
}

async function graceRow(): Promise<HTMLElement> {
  const name = await screen.findByText('Grace');
  const row = name.closest('li');
  if (!row) throw new Error('member row not found');
  return row;
}

describe('BoardSharingPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(authContext.useAuth).mockReturnValue({
      status: 'authenticated',
      user: { id: OWNER_ID, displayName: 'Ada' } as UserPublic,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      updateUser: vi.fn(),
      retry: vi.fn(),
    });
    vi.mocked(invitesApi.listInvites).mockResolvedValue([]);
    vi.mocked(membersApi.listMembers).mockResolvedValue(members);
  });

  it('uses an icon close button, focuses it, closes on Escape, and fits a phone', async () => {
    const onClose = vi.fn();
    renderPanel(onClose);

    const close = screen.getByRole('button', { name: /close sharing panel/i });
    expect(close.textContent).toBe('');
    expect(close.querySelector('svg')).not.toBeNull();
    expect(close).toHaveFocus();
    expect(screen.getByRole('dialog')).toHaveClass('w-full', 'sm:w-96');

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('lists members, marks the owner and you, and locks the owner row', async () => {
    renderPanel();
    const members = await screen.findByRole('list', { name: /members/i });
    const ownerRow = within(members).getByText('Ada').closest('li');
    if (!ownerRow) throw new Error('owner row not found');
    expect(within(ownerRow).getByText('ada@example.com')).toBeInTheDocument();
    expect(within(ownerRow).getByText(/^you$/i)).toBeInTheDocument();
    expect(within(ownerRow).getByText(/^owner$/i)).toBeInTheDocument();
    expect(within(ownerRow).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(ownerRow).queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();

    const row = await graceRow();
    expect(within(row).getByRole('combobox', { name: /role for grace/i })).toHaveValue('viewer');
    expect(within(row).getByRole('button', { name: /remove grace/i })).toBeInTheDocument();
  });

  it('shows a loading state, then an error state with retry', async () => {
    vi.mocked(membersApi.listMembers).mockRejectedValueOnce(new Error('boom'));
    renderPanel();
    expect(screen.getByText(/loading members/i)).toBeInTheDocument();
    expect(await screen.findByText(/couldn.t load members/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /retry loading members/i }));
    expect(await screen.findByText('Grace')).toBeInTheDocument();
  });

  it('shows an empty state when only the owner is on the board', async () => {
    vi.mocked(membersApi.listMembers).mockResolvedValue([members[0] as BoardMember]);
    renderPanel();
    expect(await screen.findByText(/no one else has joined/i)).toBeInTheDocument();
  });

  it('changes a member role and shows a per-row pending state', async () => {
    let resolve: (v: { ok: true }) => void = () => undefined;
    vi.mocked(membersApi.updateMemberRole).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const client = renderPanel();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const row = await graceRow();

    await userEvent.selectOptions(within(row).getByRole('combobox', { name: /role for grace/i }), 'editor');
    expect(membersApi.updateMemberRole).toHaveBeenCalledWith('b1', GRACE_ID, 'editor');
    expect(within(row).getByRole('combobox', { name: /role for grace/i })).toBeDisabled();
    expect(within(row).getByText(/saving/i)).toBeInTheDocument();

    resolve({ ok: true });
    await vi.waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['board', 'b1', 'members'] }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['board', 'b1', 'invites'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['board', 'b1'] });
  });

  it('surfaces a failed role change on the row', async () => {
    vi.mocked(membersApi.updateMemberRole).mockRejectedValue(new Error('nope'));
    renderPanel();
    const row = await graceRow();
    await userEvent.selectOptions(within(row).getByRole('combobox', { name: /role for grace/i }), 'editor');
    expect(await within(row).findByRole('alert')).toHaveTextContent(/couldn.t change role/i);
  });

  it('asks for confirmation before removing, and cancel keeps the member', async () => {
    renderPanel();
    const row = await graceRow();
    await userEvent.click(within(row).getByRole('button', { name: /remove grace/i }));
    expect(membersApi.removeMember).not.toHaveBeenCalled();
    expect(within(row).getByText(/remove grace from this board\?/i)).toBeInTheDocument();

    const cancel = within(row).getByRole('button', { name: /cancel/i });
    expect(cancel).toHaveFocus();
    await userEvent.click(cancel);
    expect(membersApi.removeMember).not.toHaveBeenCalled();
    expect(within(row).getByRole('button', { name: /remove grace/i })).toBeInTheDocument();
  });

  it('removes a member, explains the share-link reset, and offers a new link', async () => {
    vi.mocked(membersApi.removeMember).mockResolvedValue(undefined);
    vi.mocked(invitesApi.createInvite).mockResolvedValue({
      inviteUrl: 'https://syncflow.test/invite/new-token',
    } as Awaited<ReturnType<typeof invitesApi.createInvite>>);
    renderPanel();
    const row = await graceRow();
    await userEvent.click(within(row).getByRole('button', { name: /remove grace/i }));
    await userEvent.click(within(row).getByRole('button', { name: /confirm remove/i }));
    expect(membersApi.removeMember).toHaveBeenCalledWith('b1', GRACE_ID);

    const notice = await screen.findByRole('status', { name: /members notice/i });
    expect(notice).toHaveTextContent(
      "Share links were reset so Grace can't rejoin. Create a new link to invite others.",
    );

    await userEvent.click(within(notice).getByRole('button', { name: /create new share link/i }));
    expect(invitesApi.createInvite).toHaveBeenCalledWith('b1', { kind: 'share_link', role: 'viewer' });
    expect(await within(notice).findByText('https://syncflow.test/invite/new-token')).toBeInTheDocument();
  });

  it('surfaces a failed removal on the row', async () => {
    vi.mocked(membersApi.removeMember).mockRejectedValue(new Error('nope'));
    renderPanel();
    const row = await graceRow();
    await userEvent.click(within(row).getByRole('button', { name: /remove grace/i }));
    await userEvent.click(within(row).getByRole('button', { name: /confirm remove/i }));
    expect(await within(row).findByRole('alert')).toHaveTextContent(/couldn.t remove grace/i);
    expect(screen.queryByRole('status', { name: /members notice/i })).not.toBeInTheDocument();
  });

  it('portals out of transformed ancestors to document.body', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <div data-testid="transformed" style={{ transform: 'translateZ(0)' }}>
          <BoardSharingPanel boardId="b1" open onClose={vi.fn()} />
        </div>
      </QueryClientProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: /board sharing/i });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByTestId('transformed')).not.toContainElement(dialog);
    await screen.findByText('Grace');
  });

  it('tracks revoke pending per invite row', async () => {
    const invite = (id: string, email: string): BoardInviteSummary =>
      ({
        id,
        kind: 'email',
        email,
        role: 'viewer',
        expiresAt: '2999-01-01T00:00:00.000Z',
      }) as BoardInviteSummary;
    vi.mocked(invitesApi.listInvites).mockResolvedValue([
      invite('i1', 'one@example.com'),
      invite('i2', 'two@example.com'),
    ]);
    vi.mocked(invitesApi.revokeInvite).mockReturnValue(new Promise(() => undefined));
    renderPanel();
    const first = await screen.findByRole('button', { name: /revoke invite for one@example.com/i });
    const second = screen.getByRole('button', { name: /revoke invite for two@example.com/i });

    await userEvent.click(first);
    expect(invitesApi.revokeInvite).toHaveBeenCalledWith('b1', 'i1');
    expect(first).toBeDisabled();
    expect(first).toHaveTextContent(/revoking/i);
    expect(second).toBeEnabled();
  });

  it('shows a failed link creation from the removal notice only in the notice', async () => {
    vi.mocked(membersApi.removeMember).mockResolvedValue(undefined);
    vi.mocked(invitesApi.createInvite).mockRejectedValue(new Error('nope'));
    renderPanel();
    const row = await graceRow();
    await userEvent.click(within(row).getByRole('button', { name: /remove grace/i }));
    await userEvent.click(within(row).getByRole('button', { name: /confirm remove/i }));
    const notice = await screen.findByRole('status', { name: /members notice/i });
    await userEvent.click(within(notice).getByRole('button', { name: /create new share link/i }));

    expect(await within(notice).findByRole('alert')).toHaveTextContent(/failed to create link/i);
    expect(screen.getAllByText(/failed to create link/i)).toHaveLength(1);
  });

  it('shows a failed link creation from the share-link section only there', async () => {
    vi.mocked(invitesApi.createInvite).mockRejectedValue(new Error('nope'));
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^create share link$/i }));
    expect(await screen.findByText(/failed to create link/i)).toBeInTheDocument();
    expect(screen.getAllByText(/failed to create link/i)).toHaveLength(1);
  });
});
