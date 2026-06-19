import { z } from 'zod';

/** Liveness/readiness of a single dependency. */
export const dependencyStateSchema = z.enum(['up', 'down']);
export type DependencyState = z.infer<typeof dependencyStateSchema>;

/**
 * Health envelope returned by the API health endpoints and validated by the
 * web client. Single source of truth across the network boundary.
 */
export const healthStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string(),
  details: z.record(z.string(), dependencyStateSchema).optional(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
