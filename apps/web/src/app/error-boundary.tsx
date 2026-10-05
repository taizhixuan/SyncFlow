import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface State {
  error: Error | null;
}

/**
 * Last line of defence for a render that throws. Without it React unmounts the
 * whole tree and the user is left on a blank page with no way forward.
 *
 * A class because React only offers error boundaries as class components; this
 * is the one exception to the function-components rule.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep it visible to whoever opens the console; there is no client log sink.
    console.error('Unhandled render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-paper px-4 dark:bg-paper-dark">
        <div
          role="alert"
          className="w-full max-w-sm rounded-xl border border-line bg-raised p-6 text-center shadow-float dark:border-line-dark dark:bg-raised-dark"
        >
          <AlertTriangle size={28} strokeWidth={1.75} className="mx-auto text-ink-400" aria-hidden="true" />
          <h1 className="mt-3 font-display text-lg font-semibold text-ink dark:text-ink-dark">
            Something went wrong
          </h1>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-dark">
            This page hit an unexpected error. Reloading usually fixes it; your boards are saved.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Reload
            </button>
            {/* A plain link: the boundary sits above the router. */}
            <a
              href="/app"
              className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-600 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-line-dark dark:text-ink-dark dark:hover:bg-sunken-dark"
            >
              Back to boards
            </a>
          </div>
        </div>
      </main>
    );
  }
}
