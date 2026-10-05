import { ApiError } from './api-client';

/**
 * Retry policy for every query: one more try for failures that can clear by
 * themselves (network drop, 5xx cold start, 429), none for other 4xx answers.
 * Retrying a 404 only doubled the request and held the "not found" screen back
 * behind the retry delay.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return error.status === 429;
  return true;
}
