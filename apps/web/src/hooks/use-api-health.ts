import { useCallback, useEffect, useState } from 'react';
import { healthStatusSchema, type HealthStatus } from '@syncflow/shared';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

type HealthState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: HealthStatus };

/** Polls the API readiness endpoint and validates the payload with the shared schema. */
export function useApiHealth(pollMs = 5000): { state: HealthState; refresh: () => void } {
  const [state, setState] = useState<HealthState>({ phase: 'loading' });

  const fetchHealth = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${API_URL}/health/ready`, { signal });
      const json: unknown = await response.json();
      // The same Zod schema the server's response is shaped by — single source of truth.
      const data = healthStatusSchema.parse(json);
      setState({ phase: 'ready', data });
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      setState({ phase: 'error', message: 'Cannot reach the SyncFlow API.' });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchHealth(controller.signal);
    const id = window.setInterval(() => void fetchHealth(controller.signal), pollMs);
    return () => {
      controller.abort();
      window.clearInterval(id);
    };
  }, [fetchHealth, pollMs]);

  return { state, refresh: () => void fetchHealth() };
}
