import { Loader2 } from 'lucide-react';

/** The slice of an infinite query this control needs. */
export interface NextPageState {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => Promise<unknown>;
}

/**
 * "Load more" for a cursor-paginated list, with its own pending and error states.
 * Renders nothing once the last page is loaded. A failed page keeps the button so
 * it doubles as the retry.
 */
export function LoadMoreButton({
  query,
  label,
  errorText,
  className = '',
}: {
  query: NextPageState;
  label: string;
  errorText: string;
  className?: string;
}): JSX.Element | null {
  if (!query.hasNextPage) return null;
  const pending = query.isFetchingNextPage;

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => void query.fetchNextPage()}
        disabled={pending}
        aria-label={label}
        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-3 py-1.5 text-sm font-medium text-ink-600 hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-wait disabled:opacity-60 dark:border-line-dark dark:bg-raised-dark dark:text-ink-dark"
      >
        {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
        {pending ? 'Loading…' : label}
      </button>
      {query.isFetchNextPageError && !pending && (
        <p role="alert" className="text-xs text-danger">
          {errorText}
        </p>
      )}
    </div>
  );
}
