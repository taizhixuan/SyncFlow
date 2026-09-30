import { BadRequestException } from '@nestjs/common';
import { PAGE_LIMIT_DEFAULT, type Paginated } from '@syncflow/shared';

/**
 * Keyset position: the sort timestamp and id of the last row on a page. Opaque
 * to clients (base64url JSON) so the encoding can change without a contract
 * change; anything that does not decode to a valid position is a 400.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CursorPosition {
  at: Date;
  id: string;
}

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(JSON.stringify({ t: position.at.toISOString(), id: position.id })).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPosition {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
  if (typeof value !== 'object' || value === null) throw new BadRequestException('Invalid cursor');
  const { t, id } = value as Record<string, unknown>;
  const at = typeof t === 'string' ? new Date(t) : null;
  // Every paginated key is a uuid column; a non-uuid would reach Postgres as a 500.
  if (!at || Number.isNaN(at.getTime()) || typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw new BadRequestException('Invalid cursor');
  }
  return { at, id };
}

export function pageLimit(limit: number | undefined): number {
  return limit ?? PAGE_LIMIT_DEFAULT;
}

/**
 * Turn `limit + 1` fetched rows into a page: the extra row only signals that
 * another page exists, and the cursor points at the last row actually returned.
 */
export function toPage<Row, Item>(
  rows: Row[],
  limit: number,
  position: (row: Row) => CursorPosition,
  map: (row: Row) => Item,
): Paginated<Item> {
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  const nextCursor = rows.length > limit && last !== undefined ? encodeCursor(position(last)) : null;
  return { items: pageRows.map(map), nextCursor };
}
