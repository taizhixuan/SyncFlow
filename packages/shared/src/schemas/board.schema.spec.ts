import { describe, it, expect } from 'vitest';
import { boardVersionSchema } from './board.schema';

describe('board version contract', () => {
  const base = { docVersion: 3, reason: 'autosave', createdAt: '2026-01-01T00:00:00.000Z' };

  it('carries the author display name, null for system saves', () => {
    const named = { ...base, createdBy: '123e4567-e89b-12d3-a456-426614174000', createdByName: 'Ada' };
    expect(boardVersionSchema.safeParse(named).success).toBe(true);
    expect(boardVersionSchema.safeParse({ ...base, createdBy: null, createdByName: null }).success).toBe(true);
  });

  it('requires the author name field', () => {
    expect(boardVersionSchema.safeParse({ ...base, createdBy: null }).success).toBe(false);
  });
});
