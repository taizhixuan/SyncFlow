import { useEffect, useRef, useState } from 'react';

// Copying by hand is the fallback, so name the shortcut the visitor actually has.
const COPY_SHORTCUT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent)
    ? 'Cmd+C'
    : 'Ctrl+C';

type CopyState = 'idle' | 'copied' | 'manual';

/**
 * A read-only link with a Copy button. The Clipboard API is missing outside a
 * secure context (plain http) and can be refused, so a failed copy selects the
 * link instead and says which shortcut copies it: never a silent no-op.
 */
export function CopyLinkField({
  url,
  label,
  className = '',
  buttonClassName = '',
}: {
  url: string;
  label: string;
  className?: string;
  buttonClassName?: string;
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  // A new link starts fresh; "Copied!" referred to the old one.
  useEffect(() => {
    clearTimeout(resetTimer.current);
    setState('idle');
  }, [url]);

  function copyByHand(): void {
    inputRef.current?.focus();
    inputRef.current?.select();
    setState('manual');
  }

  async function copy(): Promise<void> {
    clearTimeout(resetTimer.current);
    // `clipboard` is typed as always present, but it is undefined over plain http.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard) {
      copyByHand();
      return;
    }
    try {
      await clipboard.writeText(url);
    } catch {
      copyByHand();
      return;
    }
    setState('copied');
    resetTimer.current = setTimeout(() => setState('idle'), 2000);
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          readOnly
          value={url}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 truncate bg-transparent font-mono text-xs text-ink-600 focus:outline-none dark:text-ink-dark"
        />
        <button
          onClick={() => void copy()}
          className={`shrink-0 rounded-md px-2 py-1 text-xs text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${buttonClassName}`}
        >
          {state === 'copied' ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {state === 'manual' && (
        <p role="status" className="mt-1 text-xs text-ink-600 dark:text-ink-dark">
          Press {COPY_SHORTCUT} to copy the selected link.
        </p>
      )}
    </div>
  );
}
