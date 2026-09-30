import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { PAGE_LIMIT_MAX, paginated, paginationQuerySchema } from './pagination.schema';
import { addMemberRequestSchema, transferOwnershipRequestSchema } from './board.schema';

describe('pagination contract', () => {
  it('wraps items with a nullable nextCursor', () => {
    const page = paginated(z.object({ id: z.string() }));
    expect(page.safeParse({ items: [{ id: 'a' }], nextCursor: 'abc' }).success).toBe(true);
    expect(page.safeParse({ items: [], nextCursor: null }).success).toBe(true);
    expect(page.safeParse({ items: [] }).success).toBe(false);
  });

  it('bounds the page size', () => {
    expect(paginationQuerySchema.safeParse({ limit: '10' }).success).toBe(true);
    expect(paginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: PAGE_LIMIT_MAX + 1 }).success).toBe(false);
  });
});

describe('membership contracts', () => {
  it('normalizes the add-member email', () => {
    const parsed = addMemberRequestSchema.parse({ email: '  Ada@Example.COM ', role: 'viewer' });
    expect(parsed.email).toBe('ada@example.com');
  });

  it('requires a uuid for ownership transfer', () => {
    expect(transferOwnershipRequestSchema.safeParse({ userId: 'nope' }).success).toBe(false);
    expect(
      transferOwnershipRequestSchema.safeParse({ userId: '123e4567-e89b-12d3-a456-426614174000' }).success,
    ).toBe(true);
  });
});
