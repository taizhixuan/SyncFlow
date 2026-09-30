import { z } from 'zod';

/** Page size used when a list request does not pass `?limit=`. */
export const PAGE_LIMIT_DEFAULT = 50;
/** Largest `?limit=` a list endpoint accepts. */
export const PAGE_LIMIT_MAX = 100;

/**
 * Query for cursor-paginated list endpoints. `cursor` is opaque: pass back the
 * previous page's `nextCursor` unchanged; a tampered cursor is rejected (400).
 */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).optional(),
  cursor: z.string().min(1).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** One page of a list. `nextCursor` is null on the last page. */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

/** Build the response schema for a paginated list of `item`. */
export function paginated<T extends z.ZodTypeAny>(
  item: T,
): z.ZodObject<{ items: z.ZodArray<T>; nextCursor: z.ZodNullable<z.ZodString> }> {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
