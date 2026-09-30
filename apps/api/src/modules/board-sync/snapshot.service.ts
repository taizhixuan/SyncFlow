import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BoardVersion } from '@syncflow/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** The history panel shows the newest versions; older rows stay restorable by number. */
export const VERSION_LIST_LIMIT = 100;

// Bounded so a pathological write storm surfaces as an error instead of a hot loop.
const MAX_VERSION_ATTEMPTS = 5;

export type SnapshotReason = 'autosave' | 'restore' | 'manual';

export function nextDocVersion(latest: number | null): number {
  return (latest ?? 0) + 1;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async loadLatest(boardId: string): Promise<Uint8Array | null> {
    const row = await this.prisma.boardSnapshot.findFirst({
      where: { boardId },
      orderBy: { docVersion: 'desc' },
      select: { yjsState: true },
    });
    return row ? new Uint8Array(row.yjsState) : null;
  }

  async list(boardId: string): Promise<BoardVersion[]> {
    const rows = await this.prisma.boardSnapshot.findMany({
      where: { boardId },
      orderBy: { docVersion: 'desc' },
      take: VERSION_LIST_LIMIT,
      select: { docVersion: true, reason: true, createdBy: true, createdAt: true },
    });
    const names = await this.authorNames(rows.map((r) => r.createdBy));
    return rows.map((r) => ({
      docVersion: r.docVersion,
      reason: r.reason,
      createdBy: r.createdBy,
      createdByName: r.createdBy === null ? null : (names.get(r.createdBy) ?? null),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * `created_by` is a bare id with no relation (a deleted user must not take
   * the board's history with them), so names are resolved in one batched query
   * rather than per row. Ids with no user row simply have no entry.
   */
  private async authorNames(ids: Array<string | null>): Promise<Map<string, string>> {
    const unique = Array.from(new Set(ids.filter((id): id is string => id !== null)));
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  async getByVersion(boardId: string, docVersion: number): Promise<Uint8Array | null> {
    const row = await this.prisma.boardSnapshot.findUnique({
      where: { boardId_docVersion: { boardId, docVersion } },
      select: { yjsState: true },
    });
    return row ? new Uint8Array(row.yjsState) : null;
  }

  /**
   * Insert `state` as the board's next version and return that version number.
   * Several writers can race for the same number (two instances flushing one
   * board, a debounced flush vs. a disconnect flush, a restore), so a unique
   * violation on (board_id, doc_version) re-reads the latest and tries again.
   */
  async save(
    boardId: string,
    state: Uint8Array,
    createdBy?: string,
    reason: SnapshotReason = 'autosave',
  ): Promise<number> {
    for (let attempt = 1; ; attempt += 1) {
      const latest = await this.prisma.boardSnapshot.findFirst({
        where: { boardId },
        orderBy: { docVersion: 'desc' },
        select: { docVersion: true },
      });
      const docVersion = nextDocVersion(latest?.docVersion ?? null);
      try {
        await this.prisma.boardSnapshot.create({
          data: {
            boardId,
            docVersion,
            yjsState: Buffer.from(state),
            reason,
            createdBy: createdBy ?? null,
          },
        });
        return docVersion;
      } catch (err) {
        if (!isUniqueViolation(err) || attempt >= MAX_VERSION_ATTEMPTS) throw err;
      }
    }
  }
}
