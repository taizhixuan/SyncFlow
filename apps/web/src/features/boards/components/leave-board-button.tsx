import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DoorOpen, Loader2 } from 'lucide-react';
import { useLeaveBoard } from '../hooks/use-boards';

/**
 * "Leave board" for an editor or viewer inside the board, with an inline confirm.
 * On success it returns to the dashboard; the owner must never be shown this
 * (the API answers 409 until ownership is transferred).
 */
export function LeaveBoardButton({
  boardId,
  boardTitle,
  className = '',
  initiallyConfirming = false,
  onCancel,
}: {
  boardId: string;
  boardTitle: string;
  className?: string;
  /** Open on the confirm step — for callers whose own trigger already asked to leave. */
  initiallyConfirming?: boolean;
  /** Called on Cancel instead of returning to the button, e.g. to close a popover. */
  onCancel?: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const leave = useLeaveBoard();
  const [confirming, setConfirming] = useState(initiallyConfirming);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  function cancel(): void {
    if (onCancel) onCancel();
    else setConfirming(false);
  }

  function confirmLeave(): void {
    leave.mutate(boardId, { onSuccess: () => navigate('/app', { replace: true }) });
  }

  return (
    <div className={className}>
      {confirming ? (
        <div
          role="group"
          aria-label="Leave board"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !leave.isPending) {
              e.stopPropagation();
              cancel();
            }
          }}
          className="rounded-md border border-line bg-rose-50 px-3 py-2 dark:border-line-dark dark:bg-rose-900/20"
        >
          <p className="text-xs text-ink-600 dark:text-ink-dark">
            Leave “{boardTitle}”? You’ll lose access until someone invites you again.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={cancel}
              disabled={leave.isPending}
              className="rounded-md px-2 py-1 text-xs text-ink-600 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 dark:text-ink-dark dark:hover:bg-sunken-dark"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmLeave}
              disabled={leave.isPending}
              aria-label={`Confirm leave ${boardTitle}`}
              className="inline-flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-xs font-medium text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-70"
            >
              {leave.isPending && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
              {leave.isPending ? 'Leaving…' : 'Leave'}
            </button>
          </div>
          {leave.isError && (
            <p role="alert" className="mt-1 text-xs text-danger">
              Couldn&apos;t leave this board. Please try again.
            </p>
          )}
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            leave.reset();
            setConfirming(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-danger hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-rose-900/20"
        >
          <DoorOpen size={16} aria-hidden="true" />
          Leave board
        </button>
      )}
    </div>
  );
}
