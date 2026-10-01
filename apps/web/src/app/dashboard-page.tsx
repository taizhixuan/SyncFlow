import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
  Copy,
  Loader2,
  DoorOpen,
  X,
  Search,
  LayoutGrid,
  List,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react';
import { PRESENCE_PALETTE, type Board, type BoardRole } from '@syncflow/shared';
import { Brand } from '@/components/brand';
import { Button } from '@/components/button';
import { useTheme } from '@/app/theme';
import { useAuth } from '@/features/auth/auth-context';
import { ProfileModal } from '@/features/auth/components/profile-modal';
import { LoadMoreButton } from '@/features/boards/components/load-more-button';
import {
  flattenPages,
  useBoards,
  useCreateBoard,
  useDeleteBoard,
  useDuplicateBoard,
  useLeaveBoard,
} from '@/features/boards/hooks/use-boards';
import { readBoardsView, writeBoardsView, type BoardsView } from '@/lib/ui-preferences';

type Filter = 'all' | 'owned' | 'shared';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'owned', label: 'Owned by me' },
  { id: 'shared', label: 'Shared with me' },
];

export function DashboardPage(): JSX.Element {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const boards = useBoards();
  const createBoard = useCreateBoard();
  const deleteBoard = useDeleteBoard();
  const duplicateBoard = useDuplicateBoard();
  const leaveBoard = useLeaveBoard();
  const [profileOpen, setProfileOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [view, setView] = useState<BoardsView>(readBoardsView);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const changeView = (next: BoardsView): void => {
    setView(next);
    writeBoardsView(next);
  };

  const onNew = (): void => {
    setActionError(null);
    createBoard.mutate(undefined, {
      onSuccess: (board) => navigate(`/app/board/${board.id}`),
      onError: () => setActionError('Couldn’t create a board. Please try again.'),
    });
  };

  const onDuplicate = (board: Board): void => {
    setActionError(null);
    duplicateBoard.mutate(board.id, {
      onError: () => setActionError(`Couldn’t duplicate “${board.title}”. Please try again.`),
    });
  };

  // Both run after the item's inline confirm.
  const onDelete = (board: Board): void => {
    setActionError(null);
    deleteBoard.mutate(board.id, {
      onError: () => setActionError(`Couldn’t delete “${board.title}”. Please try again.`),
    });
  };

  const onLeave = (board: Board): void => {
    setActionError(null);
    leaveBoard.mutate(board.id, {
      onError: () => setActionError(`Couldn’t leave “${board.title}”. Please try again.`),
    });
  };

  const items = flattenPages(boards.data);
  // A failed *next* page keeps the pages already loaded; only a first-page failure is fatal.
  const hasData = boards.data !== undefined;
  const count = items.length;
  const countLabel = `${count}${boards.hasNextPage ? '+' : ''}`;

  // Search and the owned/shared filter narrow the boards already loaded; "Load
  // more" below still pages in the rest.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (b) =>
        (filter === 'all' || (filter === 'owned' ? b.role === 'owner' : b.role !== 'owner')) &&
        (!q || b.title.toLowerCase().includes(q)),
    );
  }, [items, filter, query]);
  const narrowed = filter !== 'all' || query.trim() !== '';

  const itemProps = (board: Board): BoardItemProps => ({
    board,
    onOpen: () => navigate(`/app/board/${board.id}`),
    onDuplicate: () => onDuplicate(board),
    duplicating: duplicateBoard.isPending && duplicateBoard.variables === board.id,
    deleting: deleteBoard.isPending && deleteBoard.variables === board.id,
    onDelete: board.role === 'owner' ? () => onDelete(board) : undefined,
    leaving: leaveBoard.isPending && leaveBoard.variables === board.id,
    onLeave: board.role === 'owner' ? undefined : () => onLeave(board),
  });

  return (
    <div className="flex min-h-[100dvh] bg-paper">
      {/* Sidebar (md+) */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-line bg-chrome p-3 md:flex">
        <div className="px-2 py-1.5">
          <Brand />
        </div>
        <nav aria-label="Boards" className="mt-6 flex flex-col gap-0.5 text-sm">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-current={filter === f.id ? 'page' : undefined}
              className={`flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left transition-colors ${
                filter === f.id ? 'bg-sunken font-medium text-ink' : 'text-ink-400 hover:bg-sunken hover:text-ink'
              }`}
            >
              {f.id === 'all' ? (
                <LayoutGrid size={15} aria-hidden="true" />
              ) : f.id === 'owned' ? (
                <Crown size={15} aria-hidden="true" />
              ) : (
                <Users size={15} aria-hidden="true" />
              )}
              <span className="flex-1">{f.id === 'all' ? 'All boards' : f.label}</span>
              {f.id === 'all' && hasData && <span className="font-mono text-[11px] text-ink-400">{countLabel}</span>}
            </button>
          ))}
        </nav>

        <div className="mt-6 px-2.5 font-mono text-[10px] uppercase tracking-wider text-ink-400">Scratch</div>
        <Link
          to="/app/board/local"
          className="mt-1 flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-ink-400 hover:bg-sunken hover:text-ink"
        >
          <PenLine size={15} aria-hidden="true" />
          Local scratch board
        </Link>

        <div className="mt-auto rounded-lg border border-line p-3 text-xs leading-relaxed text-ink-400">
          <p className="font-medium text-ink">Works offline</p>
          Edits made without a connection sync the moment you’re back.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-chrome/90 px-4 backdrop-blur sm:px-8 md:justify-end">
          <Brand className="md:hidden" />
          <div className="flex items-center gap-1">
            {user && (
              <ProfileButton name={user.displayName} color={user.color} avatarUrl={user.avatarUrl} onClick={() => setProfileOpen(true)} />
            )}
            <IconButton label={theme === 'dark' ? 'Light theme' : 'Dark theme'} onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </IconButton>
            <IconButton label="Log out" onClick={() => void logout()}>
              <LogOut size={16} aria-hidden="true" />
            </IconButton>
          </div>
        </header>
        {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">
                {user ? `Welcome back, ${user.displayName}.` : 'Your boards'}
              </h1>
              <p className="mt-1 text-sm text-ink-400">
                {count > 0
                  ? `You have ${countLabel} board${count === 1 && !boards.hasNextPage ? '' : 's'}. Pick one or start fresh.`
                  : 'Create your first board and start drawing together.'}
              </p>
            </div>
            <Button onClick={onNew} disabled={createBoard.isPending} className="w-full sm:w-auto">
              <Plus size={16} className="mr-1.5" aria-hidden="true" />
              {createBoard.isPending ? 'Creating…' : 'New board'}
            </Button>
          </div>

          {/* Toolbar */}
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <label className="relative flex h-9 min-w-0 basis-full items-center sm:max-w-xs sm:flex-1 sm:basis-auto">
              <span className="sr-only">Search boards</span>
              <Search size={15} className="pointer-events-none absolute left-2.5 text-ink-400" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search boards"
                className="h-9 w-full rounded-md border border-line bg-raised pl-8 pr-2.5 text-sm text-ink placeholder:text-ink-400 focus:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </label>
            <div role="group" aria-label="Filter boards" className="flex rounded-md border border-line bg-raised p-0.5 md:hidden">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`h-7 rounded px-2.5 text-xs font-medium ${filter === f.id ? 'bg-sunken text-ink' : 'text-ink-400'}`}
                >
                  {f.id === 'all' ? 'All' : f.id === 'owned' ? 'Mine' : 'Shared'}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Layout" className="ml-auto flex rounded-md border border-line bg-raised p-0.5">
              <button
                onClick={() => changeView('grid')}
                aria-label="Grid view"
                aria-pressed={view === 'grid'}
                className={`grid h-7 w-8 place-items-center rounded ${view === 'grid' ? 'bg-sunken text-ink' : 'text-ink-400 hover:text-ink'}`}
              >
                <LayoutGrid size={15} aria-hidden="true" />
              </button>
              <button
                onClick={() => changeView('list')}
                aria-label="List view"
                aria-pressed={view === 'list'}
                className={`grid h-7 w-8 place-items-center rounded ${view === 'list' ? 'bg-sunken text-ink' : 'text-ink-400 hover:text-ink'}`}
              >
                <List size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          {actionError && (
            <div
              role="alert"
              className="mt-6 flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              <span>{actionError}</span>
              <button
                onClick={() => setActionError(null)}
                aria-label="Dismiss error"
                className="shrink-0 rounded p-0.5 hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="mt-6">
            {boards.isLoading && (
              <div className={view === 'grid' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-2'}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className={`animate-pulse rounded-lg border border-line bg-sunken ${view === 'grid' ? 'h-52' : 'h-14'}`}
                  />
                ))}
              </div>
            )}

            {boards.isError && !hasData && (
              <div className="rounded-lg border border-line bg-raised p-8 text-center">
                <p className="text-ink">Couldn&apos;t load your boards.</p>
                <button onClick={() => void boards.refetch()} className="mt-2 text-sm font-medium text-brand hover:underline">
                  Try again
                </button>
              </div>
            )}

            {hasData && narrowed && visible.length === 0 && (
              <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-ink-400">
                No boards match{query.trim() ? ` “${query.trim()}”` : ' this filter'}.
              </p>
            )}

            {hasData && view === 'grid' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Create tile — always first, an obvious affordance. */}
                {!narrowed && (
                  <button
                    onClick={onNew}
                    disabled={createBoard.isPending}
                    className="group hidden h-52 flex-col items-center justify-center gap-3 rounded-lg border border-dashed sm:flex border-line-strong text-ink-400 transition hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-sunken transition group-hover:bg-accent group-hover:text-on-accent">
                      <Plus size={20} aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold">{createBoard.isPending ? 'Creating…' : 'New board'}</span>
                  </button>
                )}
                {visible.map((board) => (
                  <BoardItem key={board.id} layout="grid" {...itemProps(board)} />
                ))}
              </div>
            )}

            {hasData && view === 'list' && visible.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-line bg-raised">
                <div
                  aria-hidden="true"
                  className="hidden grid-cols-[minmax(0,1fr)_7rem_6rem_7rem_7.5rem] items-center gap-4 border-b border-line bg-chrome px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-ink-400 sm:grid"
                >
                  <span>Name</span>
                  <span>Role</span>
                  <span>Members</span>
                  <span>Edited</span>
                  <span />
                </div>
                {visible.map((board) => (
                  <BoardItem key={board.id} layout="list" {...itemProps(board)} />
                ))}
              </div>
            )}
          </div>

          <LoadMoreButton
            query={boards}
            label="Load more boards"
            errorText="Couldn’t load more boards. Please try again."
            className="mt-6"
          />

          {/* Local scratch board callout (the sidebar carries it from md up). */}
          <Link
            to="/app/board/local"
            className="mt-8 flex items-center gap-3 rounded-lg border border-line bg-raised px-4 py-3 transition hover:border-line-strong md:hidden"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sunken text-ink-600">
              <PenLine size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">Open a local scratch board</span>
              <span className="block text-xs text-ink-400">No account needed. Saved offline on this device only.</span>
            </span>
          </Link>
        </main>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-400 hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {children}
    </button>
  );
}

function ProfileButton({
  name,
  color,
  avatarUrl,
  onClick,
  wide = false,
}: {
  name: string;
  color: string;
  avatarUrl?: string | null;
  onClick: () => void;
  wide?: boolean;
}): JSX.Element {
  return (
    <button
      title="Edit profile"
      aria-label="Edit profile"
      onClick={onClick}
      className={`flex min-w-0 items-center gap-2 rounded-md p-1 text-sm hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${wide ? 'flex-1 pr-2' : ''}`}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full"
        style={avatarUrl ? undefined : { backgroundColor: color }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="h-full w-full object-cover" crossOrigin="anonymous" />
        ) : (
          <span className="text-xs font-semibold text-white">{name.charAt(0).toUpperCase()}</span>
        )}
      </span>
      {wide && <span className="truncate font-medium text-ink">{name}</span>}
    </button>
  );
}

// The label stays in readable ink; only the icon carries the role colour (amber
// text would fail contrast on the light theme).
const ROLE_META: Record<BoardRole, { Icon: LucideIcon; label: string; iconClass: string }> = {
  owner: { Icon: Crown, label: 'Owner', iconClass: 'text-warn' },
  editor: { Icon: Pencil, label: 'Editor', iconClass: 'text-brand' },
  viewer: { Icon: Eye, label: 'Viewer', iconClass: 'text-ink-400' },
};

// Item actions stay in the tab order and on touch screens; they only fade in on
// hover for mouse users (display:none would make them unreachable).
const ITEM_ACTION =
  'grid h-7 w-7 place-items-center rounded-md text-ink-400 transition opacity-0 group-hover:opacity-100 ' +
  'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' +
  '[@media(hover:none)]:opacity-100 disabled:cursor-wait disabled:opacity-100 bg-raised/90';

interface BoardItemProps {
  board: Board;
  onOpen: () => void;
  onDuplicate: () => void;
  duplicating: boolean;
  onDelete?: () => void;
  deleting: boolean;
  onLeave?: () => void;
  leaving: boolean;
}

/** One board, as a card (grid) or a table row (list); both share the actions and inline confirm. */
function BoardItem({
  layout,
  board,
  onOpen,
  onDuplicate,
  duplicating,
  onDelete,
  deleting,
  onLeave,
  leaving,
}: BoardItemProps & { layout: BoardsView }): JSX.Element {
  const role = ROLE_META[board.role];
  const [confirming, setConfirming] = useState<'delete' | 'leave' | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const lastConfirm = useRef<'delete' | 'leave' | null>(null);
  const pending = deleting || leaving;
  const wasPending = useRef(false);

  // Focus moves into the confirm when it opens and back to its trigger when it closes.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (lastConfirm.current === 'delete') deleteRef.current?.focus();
    else if (lastConfirm.current === 'leave') leaveRef.current?.focus();
    lastConfirm.current = confirming;
  }, [confirming]);

  // A failed action closes the confirm; the page-level alert explains what went wrong.
  useEffect(() => {
    if (wasPending.current && !pending) setConfirming(null);
    wasPending.current = pending;
  }, [pending]);

  const confirmCopy =
    confirming === 'delete'
      ? {
          text: `Delete “${board.title}”? This cannot be undone.`,
          action: 'Delete',
          busy: 'Deleting…',
          run: onDelete,
        }
      : {
          text: `Leave “${board.title}”? You’ll lose access until someone invites you again.`,
          action: 'Leave',
          busy: 'Leaving…',
          run: onLeave,
        };

  const actions = (
    <>
      <button
        onClick={onDuplicate}
        disabled={duplicating}
        aria-label={duplicating ? `Duplicating ${board.title}` : `Duplicate ${board.title}`}
        title="Duplicate board"
        className={`${ITEM_ACTION} hover:bg-sunken hover:text-ink`}
      >
        {duplicating ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      </button>
      {onLeave && (
        <button
          ref={leaveRef}
          onClick={() => setConfirming('leave')}
          disabled={leaving}
          aria-label={leaving ? `Leaving ${board.title}` : `Leave ${board.title}`}
          title="Leave board"
          className={`${ITEM_ACTION} hover:bg-danger/10 hover:text-danger`}
        >
          {leaving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <DoorOpen size={15} aria-hidden="true" />}
        </button>
      )}
      {onDelete && (
        <button
          ref={deleteRef}
          onClick={() => setConfirming('delete')}
          disabled={deleting}
          aria-label={deleting ? `Deleting ${board.title}` : `Delete ${board.title}`}
          title="Delete board"
          className={`${ITEM_ACTION} hover:bg-danger/10 hover:text-danger`}
        >
          {deleting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
        </button>
      )}
    </>
  );

  const confirm = confirming && (
    <div
      role="group"
      aria-label={`${confirmCopy.action} ${board.title}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !pending) {
          e.stopPropagation();
          setConfirming(null);
        }
      }}
      className={`absolute inset-0 z-30 flex gap-3 bg-raised/95 backdrop-blur-sm ${
        layout === 'grid' ? 'flex-col justify-center p-4' : 'items-center justify-between px-4'
      }`}
    >
      <p className={`text-sm text-ink ${layout === 'list' ? 'truncate' : ''}`}>{confirmCopy.text}</p>
      <div className="flex shrink-0 justify-end gap-2">
        <button
          ref={cancelRef}
          onClick={() => setConfirming(null)}
          disabled={pending}
          className="rounded-md px-3 py-1.5 text-sm text-ink-600 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => confirmCopy.run?.()}
          disabled={pending}
          aria-label={`Confirm ${confirmCopy.action.toLowerCase()} ${board.title}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-70"
        >
          {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {pending ? confirmCopy.busy : confirmCopy.action}
        </button>
      </div>
    </div>
  );

  // Transparent overlay covers the whole item to open it; the action buttons
  // sit above it (higher z), and visual content sits below it.
  const opener = <button onClick={onOpen} className="absolute inset-0 z-10" aria-label={`Open ${board.title}`} />;

  if (layout === 'list') {
    return (
      <div className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-line px-4 py-2.5 last:border-b-0 hover:bg-sunken/50 sm:grid-cols-[minmax(0,1fr)_7rem_6rem_7rem_7.5rem]">
        {opener}
        <span className="flex min-w-0 items-center gap-3">
          <Thumbnail board={board} className="h-8 w-12 shrink-0 rounded border border-line" mini />
          <span className="truncate text-sm font-medium text-ink">{board.title}</span>
          {board.isPublic && <Globe size={12} className="shrink-0 text-ink-400" aria-label="Shared by link" />}
        </span>
        <span className={`hidden items-center gap-1.5 text-xs text-ink-600 sm:flex`}>
          <role.Icon size={12} className={role.iconClass} aria-hidden="true" />
          {role.label}
        </span>
        <span className="hidden items-center gap-1.5 font-mono text-xs text-ink-400 sm:flex">
          <Users size={12} aria-hidden="true" />
          {board.memberCount}
        </span>
        <span className="hidden font-mono text-xs text-ink-400 sm:block">{timeAgo(board.updatedAt)}</span>
        <span className="relative z-20 flex justify-end gap-0.5">{actions}</span>
        {confirm}
      </div>
    );
  }

  return (
    <div className="group relative flex h-52 flex-col overflow-hidden rounded-lg border border-line bg-raised transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-float">
      {opener}
      <div className="relative h-32 border-b border-line">
        <Thumbnail board={board} className="h-full w-full" />
        {board.isPublic && (
          <span className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-1 rounded border border-line bg-raised/90 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">
            <Globe size={10} aria-hidden="true" /> shared
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1.5 px-4">
        <p className="truncate text-[15px] font-semibold text-ink">{board.title}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs text-ink-600">
            <role.Icon size={12} className={role.iconClass} aria-hidden="true" />
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
      <div className="absolute right-2 top-2 z-20 flex gap-0.5">{actions}</div>
      {confirm}
    </div>
  );
}

/** The board's saved thumbnail, or a stable abstract placeholder in its accent. */
function Thumbnail({ board, className, mini = false }: { board: Board; className: string; mini?: boolean }): JSX.Element {
  const accent = boardAccent(board.id);
  return (
    <div className={`relative overflow-hidden bg-paper bg-dot-grid ${mini ? 'bg-[length:6px_6px]' : 'bg-dots'} ${className}`}>
      {board.thumbnailUrl ? (
        <img src={board.thumbnailUrl} alt="" className="h-full w-full object-cover" crossOrigin="anonymous" />
      ) : (
        <>
          <span
            className="absolute left-[14%] top-[22%] h-[34%] w-[26%] rounded-sm"
            style={{ backgroundColor: accent, opacity: 0.85 }}
          />
          <span className="absolute left-[44%] top-[30%] h-[22%] w-[18%] rounded-sm border border-line-strong bg-raised" />
          <span
            className="absolute bottom-[18%] right-[16%] h-[26%] w-[16%] rounded-full border-2"
            style={{ borderColor: accent }}
          />
        </>
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
