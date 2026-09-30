import { useCallback, useEffect, useRef, useState } from 'react';
import { healthStatusSchema, type HealthStatus } from '@syncflow/shared';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

/** Poll interval while the API reports `ok` — nothing to watch closely. */
export const HEALTHY_POLL_MS = 30_000;
/** Poll interval while degraded/down/unreachable, so recovery shows up soon. */
export const UNHEALTHY_POLL_MS = 10_000;

type HealthState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: HealthStatus };

/** One readiness check; null when aborted (the caller went away or superseded it). */
async function fetchHealth(signal: AbortSignal): Promise<HealthState | null> {
  try {
    const response = await fetch(`${API_URL}/health/ready`, { signal });
    const json: unknown = await response.json();
    // The same Zod schema the server's response is shaped by — single source of truth.
    return { phase: 'ready', data: healthStatusSchema.parse(json) };
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) return null;
    return { phase: 'error', message: 'Cannot reach the SyncFlow API.' };
  }
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Polls the API readiness endpoint and validates the payload with the shared
 * schema. Polls only while the tab is visible, backs off while healthy, and
 * aborts in-flight checks on unmount so nothing sets state afterwards.
 */
export function useApiHealth(): { state: HealthState; refresh: () => void } {
  const [state, setState] = useState<HealthState>({ phase: 'loading' });
  const checkRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;

    const schedule = (ms: number): void => {
      clearTimeout(timer);
      if (!isHidden()) timer = setTimeout(() => void check(), ms);
    };

    const check = async (): Promise<void> => {
      clearTimeout(timer);
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const next = await fetchHealth(current.signal);
      if (disposed || current.signal.aborted || next === null) return;
      setState(next);
      const healthy = next.phase === 'ready' && next.data.status === 'ok';
      schedule(healthy ? HEALTHY_POLL_MS : UNHEALTHY_POLL_MS);
    };

    const onVisibilityChange = (): void => {
      if (isHidden()) {
        clearTimeout(timer);
      } else {
        void check();
      }
    };

    checkRef.current = () => void check();
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!isHidden()) void check();

    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      checkRef.current = () => undefined;
    };
  }, []);

  const refresh = useCallback(() => checkRef.current(), []);
  return { state, refresh };
}
