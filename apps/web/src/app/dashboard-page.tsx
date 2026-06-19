import { Link, useNavigate } from 'react-router-dom';
import type { Board } from '@syncflow/shared';
import { Brand } from '@/components/brand';
import { Button } from '@/components/button';
import { useAuth } from '@/features/auth/auth-context';
import { useBoards, useCreateBoard, useDeleteBoard } from '@/features/boards/hooks/use-boards';

export function DashboardPage(): JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const boards = useBoards();
  const createBoard = useCreateBoard();
  const deleteBoard = useDeleteBoard();

  const onNew = (): void => {
    createBoard.mutate(undefined, {
      onSuccess: (board) => navigate(`/app/board/${board.id}`),
    });
  };

  return (
    <div className="min-h-screen bg-paper dark:bg-paper-dark">
      <header className="flex items-center justify-between border-b border-line bg-raised px-6 py-3 dark:border-line-dark dark:bg-raised-dark">
        <Brand />
        <div className="flex items-center gap-3">
          {user && (
            <span
              title={user.displayName}
              className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: user.color }}
            >
              {user.displayName.charAt(0).toUpperCase()}
            </span>
          )}
          <button
            onClick={() => void logout()}
            className="rounded-md px-3 py-1.5 text-sm text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink dark:text-ink-dark">
              {user ? `Welcome, ${user.displayName}.` : 'Your boards'}
            </h1>
            <p className="mt-1 text-ink-600 dark:text-ink-dark">Open a board to start drawing.</p>
          </div>
          <Button onClick={onNew} disabled={createBoard.isPending}>
            {createBoard.isPending ? 'Creating…' : '+ New board'}
          </Button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {boards.isLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg border border-line bg-sunken dark:border-line-dark dark:bg-sunken-dark" />
            ))}

          {boards.isError && (
            <div className="col-span-full rounded-lg border border-line bg-raised p-6 text-center dark:border-line-dark dark:bg-raised-dark">
              <p className="text-ink dark:text-ink-dark">Couldn&apos;t load your boards.</p>
              <button onClick={() => void boards.refetch()} className="mt-2 text-sm font-medium text-brand hover:underline">
                Retry
              </button>
            </div>
          )}

          {boards.isSuccess && boards.data.items.length === 0 && (
            <div className="col-span-full flex flex-col items-center rounded-lg border border-dashed border-line py-12 dark:border-line-dark">
              <p className="font-display text-sm font-semibold text-ink dark:text-ink-dark">No boards yet.</p>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-dark">Create your first board to get started.</p>
              <Button className="mt-4" onClick={onNew}>
                + New board
              </Button>
            </div>
          )}

          {boards.isSuccess &&
            boards.data.items.map((board) => (
              <BoardCard
                key={board.id}
                board={board}
                onOpen={() => navigate(`/app/board/${board.id}`)}
                onDelete={board.role === 'owner' ? () => deleteBoard.mutate(board.id) : undefined}
              />
            ))}
        </div>

        <p className="mt-8 font-mono text-xs text-ink-400">
          Boards are persisted &amp; access-controlled.{' '}
          <Link to="/app/board/local" className="text-brand hover:underline">
            Open a local scratch board
          </Link>{' '}
          (offline, this device).
        </p>
      </main>
    </div>
  );
}

function BoardCard({
  board,
  onOpen,
  onDelete,
}: {
  board: Board;
  onOpen: () => void;
  onDelete?: () => void;
}): JSX.Element {
  return (
    <div className="group relative flex h-40 flex-col justify-between rounded-lg border border-line bg-raised p-4 shadow-raised transition hover:border-brand dark:border-line-dark dark:bg-raised-dark">
      <button onClick={onOpen} className="absolute inset-0 rounded-lg" aria-label={`Open ${board.title}`} />
      <div className="h-16 rounded-md bg-dot-grid bg-dots" />
      <div>
        <p className="font-display text-sm font-semibold text-ink dark:text-ink-dark">{board.title}</p>
        <p className="font-mono text-xs text-ink-400">
          {board.role} · {board.memberCount} {board.memberCount === 1 ? 'member' : 'members'}
        </p>
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute right-2 top-2 z-10 hidden rounded px-2 py-1 text-xs text-danger hover:bg-sunken group-hover:block dark:hover:bg-sunken-dark"
        >
          Delete
        </button>
      )}
    </div>
  );
}
