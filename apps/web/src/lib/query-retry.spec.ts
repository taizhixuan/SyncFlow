import { describe, expect, it } from 'vitest';
import { ApiError } from './api-client';
import { shouldRetryQuery } from './query-retry';

describe('shouldRetryQuery', () => {
  it('never retries a client error: the answer will not change', () => {
    for (const status of [400, 401, 403, 404, 410, 422]) {
      expect(shouldRetryQuery(0, new ApiError(status, 'x'))).toBe(false);
    }
  });

  it('retries a server error or a dropped connection once', () => {
    expect(shouldRetryQuery(0, new ApiError(503, 'x'))).toBe(true);
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(503, 'x'))).toBe(false);
  });

  it('retries a rate limit, which clears by itself', () => {
    expect(shouldRetryQuery(0, new ApiError(429, 'x'))).toBe(true);
  });
});
