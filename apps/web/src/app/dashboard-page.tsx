import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Users,
  Crown,
  Pencil,
  Eye,
  LogOut,
  Trash2,
  Globe,
  PenLine,
  type LucideIcon,
} from 'lucide-react';
import { PRESENCE_PALETTE, type Board, type BoardRole } from '@syncflow/shared';
import { Brand } from '@/components/brand';
import { Button } from '@/components/button';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileModal } from '@/features/auth/components/profile-modal';
import { useBoards, useCreateBoard, useDeleteBoard } from '@/features/boards/hooks/use-boards';

export function DashboardPage(): JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const boards = useBoards();
  const createBoard = useCreateBoard();
  const deleteBoard = useDeleteBoard();
  const [profileOpen, setProfileOpen] = useState(false);

  const onNew = (): void => {
    createBoard.mutate(undefined, {
      onSuccess: (board) => navigate(`/app/board/${board.id}`),
    });
  };

  const count = boards.isSuccess ? boards.data.items.length : 0;

  return (
    <div className="min-h-[100dvh] bg-paper bg-dot-grid bg-dots dark:bg-paper-dark">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-raised/90 px-4 py-3 backdrop-blur dark:border-line-dark dark:bg-raised-dark/90 sm:px-6">
        <Brand />
        <div className="flex items-center gap-2">
          {user && (
            <button
              title="Edit profile"
              aria-label="Edit profile"
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-sm hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-sunken-dark sm:pr-3"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full"
                style={user.avatarUrl ? undefined : { backgroundColor: user.color }}
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="h-full w-full object-cover"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <span className="text-xs font-semibold text-white">
                    {user.displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="hidden font-medium text-ink dark:text-ink-dark sm:inline">{user.displayName}</span>
            </button>
          )}
          {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
          <button
            onClick={() => void logout()}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink dark:text-ink-dark sm:text-3xl">
              {user ? `Welcome back, ${user.displayName}.` : 'Your boards'}
            </h1>
            <p className="mt-1 text-ink-600 dark:text-ink-400">
              {count > 0
                ? `You have ${count} board${count === 1 ? '' : 's'}. Pick one or start fresh.`
                : 'Create your first board and start drawing together.'}
            </p>
          </div>
          <Button onClick={onNew} disabled={createBoard.isPending} className="w-full sm:w-auto">
            <Plus size={16} className="mr-1.5" aria-hidden="true" />
            {createBoard.isPending ? 'Creating…' : 'New board'}
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-52 animate-pulse rounded-xl border border-line bg-sunken dark:border-line-dark dark:bg-sunken-dark"
              />
            ))}

          {boards.isError && (
            <div className="col-span-full rounded-xl border border-line bg-raised p-8 text-center dark:border-line-dark dark:bg-raised-dark">
              <p className="text-ink dark:text-ink-dark">Couldn&apos;t load your boards.</p>
              <button
                onClick={() => void boards.refetch()}
                className="mt-2 text-sm font-medium text-brand hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {boards.isSuccess && (
            <>
              {/* Create tile — always first, an obvious affordance. */}
              <button
                onClick={onNew}
                disabled={createBoard.isPending}
                className="group flex h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-raised/40 text-ink-600 transition hover:border-brand hover:bg-raised hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 dark:border-line-dark dark:bg-raised-dark/40 dark:text-ink-dark dark:hover:bg-raised-dark"
              >
                <span className="grid h-12 w-12 place-items-center rounded-full bg-sunken transition group-hover:bg-brand group-hover:text-white dark:bg-sunken-dark">
                  <Plus size={22} aria-hidden="true" />
                </span>
                <span className="font-display text-sm font-semibold">
                  {createBoard.isPending ? 'Creating…' : 'New board'}
                </span>
              </button>

              {boards.data.items.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  onOpen={() => navigate(`/app/board/${board.id}`)}
                  onDelete={
                    board.role === 'owner'
                      ? () => {
                          if (window.confirm(`Delete "${board.title}"? This cannot be undone.`)) {
                            deleteBoard.mutate(board.id);
                          }
                        }
                      : undefined
                  }
                />
              ))}
            </>
          )}
        </div>

        {/* Local scratch board callout. */}
        <Link
          to="/app/board/local"
          className="mt-8 flex items-center gap-3 rounded-xl border border-line bg-raised/60 px-4 py-3 transition hover:border-brand hover:bg-raised dark:border-line-dark dark:bg-raised-dark/60 dark:hover:bg-raised-dark"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sunken text-ink-600 dark:bg-sunken-dark dark:text-ink-dark">
            <PenLine size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink dark:text-ink-dark">Open a local scratch board</span>
            <span className="block text-xs text-ink-400">No account needed. Saved offline on this device only.</span>
          </span>
        </Link>
      </main>
    </div>
  );
}

const ROLE_META: Record<BoardRole, { Icon: LucideIcon; label: string; className: string }> = {
  owner: {
    Icon: Crown,
    label: 'Owner',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  editor: { Icon: Pencil, label: 'Editor', className: 'bg-brand/10 text-brand dark:bg-brand/20' },
  viewer: {
    Icon: Eye,
    label: 'Viewer',
    className: 'bg-sunken text-ink-600 dark:bg-sunken-dark dark:text-ink-dark',
  },
};

function BoardCard({
  board,
  onOpen,
  onDelete,
}: {
  board: Board;
  onOpen: () => void;
  onDelete?: () => void;
}): JSX.Element {
  const role = ROLE_META[board.role];
  const accent = boardAccent(board.id);

  return (
    <div className="group relative flex h-52 flex-col overflow-hidden rounded-xl border border-line bg-raised shadow-raised transition hover:-translate-y-0.5 hover:border-brand hover:shadow-float dark:border-line-dark dark:bg-raised-dark">
      {/* Transparent overlay covers the whole card to open it; the delete control
          sits above it (higher z), and visual content sits below it. */}
      <button onClick={onOpen} className="absolute inset-0 z-10" aria-label={`Open ${board.title}`} />

      {/* Preview */}
      <div className="relative h-28 overflow-hidden bg-paper bg-dot-grid bg-dots dark:bg-paper-dark">
        {board.thumbnailUrl ? (
          <img src={board.thumbnailUrl} alt="" className="h-full w-full object-cover" crossOrigin="anonymous" />
        ) : (
          <>
            <div
              className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-xl"
              style={{ backgroundColor: accent }}
            />
            <div
              className="absolute left-4 top-5 h-8 w-12 rounded-md shadow-sm"
              style={{ backgroundColor: accent, opacity: 0.85 }}
            />
            <div className="absolute bottom-5 right-6 h-6 w-6 rounded-full border-2" style={{ borderColor: accent }} />
          </>
        )}
        {board.isPublic && (
          <span className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-1 rounded-full bg-raised/90 px-2 py-0.5 text-[10px] font-medium text-ink-600 shadow-sm dark:bg-raised-dark/90 dark:text-ink-dark">
            <Globe size={10} aria-hidden="true" /> Shared
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col justify-between p-4">
        <p className="truncate font-display text-base font-semibold text-ink dark:text-ink-dark">{board.title}</p>
        <div className="flex items-center justify-between gap-2">
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${role.className}`}>
            <role.Icon size={11} aria-hidden="true" />
            {role.label}
          </span>
          <span className="flex items-center gap-1 font-mono text-[11px] text-ink-400">
            <Users size={12} aria-hidden="true" />
            {board.memberCount}
            <span className="mx-1">·</span>
            {timeAgo(board.updatedAt)}
          </span>
        </div>
      </div>

      {onDelete && (
        <button
          onClick={onDelete}
          aria-label={`Delete ${board.title}`}
          title="Delete board"
          className="absolute right-2 top-2 z-20 hidden rounded-md bg-raised/90 p-1.5 text-ink-400 shadow-sm transition hover:text-danger group-hover:block dark:bg-raised-dark/90"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Pick a stable accent color for a board from the presence palette. */
function boardAccent(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PRESENCE_PALETTE[h % PRESENCE_PALETTE.length] ?? '#3B5BFF';
}

/** Short relative time like "3d ago". */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}
