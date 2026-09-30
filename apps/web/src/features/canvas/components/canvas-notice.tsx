import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

/** How long a notice stays up before it dismisses itself. */
const NOTICE_MS = 6000;

export interface NoticeState {
  id: number;
  message: string;
}

/**
 * Local state for a single transient notice. Showing a new one replaces the
 * previous, so a burst of failures never stacks a wall of toasts.
 */
export function useCanvasNotice(): {
  notice: NoticeState | null;
  showNotice: (message: string) => void;
  dismissNotice: () => void;
} {
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const seq = useRef(0);
  const showNotice = useCallback((message: string): void => {
    seq.current += 1;
    setNotice({ id: seq.current, message });
  }, []);
  const dismissNotice = useCallback((): void => setNotice(null), []);
  return { notice, showNotice, dismissNotice };
}

/**
 * A small error toast for canvas failures that would otherwise be silent
 * (an image that could not be added, a rename that did not stick). Portalled
 * to `document.body` so a transformed ancestor cannot trap it.
 */
export function CanvasNotice({
  notice,
  onDismiss,
}: {
  notice: NoticeState | null;
  onDismiss: () => void;
}): JSX.Element | null {
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(onDismiss, NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice, onDismiss]);

  if (!notice) return null;
  return createPortal(
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-2 rounded-lg border border-danger/40 bg-raised px-3 py-2 text-sm text-ink shadow-float dark:bg-raised-dark dark:text-ink-dark"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <span className="min-w-0 flex-1">{notice.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notice"
        className="shrink-0 rounded p-0.5 text-ink-400 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:hover:bg-sunken-dark"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
