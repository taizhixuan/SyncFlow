import type { HealthStatus } from '@syncflow/shared';

export type StatusTone = 'success' | 'warn' | 'danger';

/** Maps an API health status to a user-facing label + tone for the status pill. */
export function describeStatus(status: HealthStatus['status']): { label: string; tone: StatusTone } {
  switch (status) {
    case 'ok':
      return { label: 'All systems go', tone: 'success' };
    case 'degraded':
      return { label: 'Running degraded', tone: 'warn' };
    case 'down':
    default:
      return { label: 'Service unavailable', tone: 'danger' };
  }
}

export const TONE_CLASS: Record<StatusTone, string> = {
  success: 'bg-success',
  warn: 'bg-warn',
  danger: 'bg-danger',
};
