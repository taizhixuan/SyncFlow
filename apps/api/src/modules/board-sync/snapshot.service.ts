import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BoardVersion } from '@syncflow/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** The history panel shows the newest versions; older rows stay restorable by number. */
export const VERSION_LIST_LIMIT = 100;

// Bounded so a pathological write storm surfaces as an error instead of a hot loop.
const MAX_VERSION_ATTEMPTS = 5;

export type SnapshotReason = 'autosave' | 'restore' | 'manual';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Every snapshot younger than this is kept. */
export const RETAIN_ALL_MS = DAY_MS;
/** Up to this age autosaves are thinned to one per hour; beyond it, one per day. */
export const RETAIN_HOURLY_MS = 30 * DAY_MS;
export const SNAPSHOT_PRUNE_INTERVAL_MS = 6 * HOUR_MS;
// First sweep shortly after boot, not during it, so startup stays fast; a
// frequently restarted instance still prunes.
const FIRST_PRUNE_DELAY_MS = 5 * 60 * 1000;
const PRUNE_BOARDS_PER_RUN = 100;
const PRUNE_ROWS_PER_BOARD = 5000;
const PRUNE_DELETE_CHUNK = 1000;

export interface PruneCandidate {
  id: string;
  docVersion: number;
  reason: SnapshotReason;
  createdAt: Date;
}

export interface PruneLimits {
  maxBoards?: number;
  maxRowsPerBoard?: number;
}

/**
 * Pick which of a board's snapshots retention thinning may delete.
 *
 * - younger than 24h: all kept;
 * - 24h to 30d: the newest autosave per clock hour (UTC) is kept;
 * - older than 30d: the newest autosave per UTC day is kept;
 * - `restore` and `manual` snapshots are deliberate checkpoints: never deleted,
 *   and they do not use up a bucket's autosave slot;
 * - the board's latest version is never deleted, so the live doc always has a
 *   seed and `save` keeps allocating monotonically (versions just go sparse).
 *
 * `rows` may be a window of a board's history: keeping the window's newest per
 * bucket never deletes a row outside the window, so partial passes stay safe.
 */
export function selectSnapshotsToPrune(
  rows: PruneCandidate[],
  now: Date,
  latestDocVersion: number | null,
): string[] {
  const newestFirst = [...rows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.docVersion - a.docVersion,
  );
  const filledBuckets = new Set<string>();
  const doomed: string[] = [];
  for (const row of newestFirst) {
    const at = row.createdAt.getTime();
    const age = now.getTime() - at;
    if (age < RETAIN_ALL_MS || row.reason !== 'autosave') continue;
    const bucket = age < RETAIN_HOURLY_MS ? `h${Math.floor(at / HOUR_MS)}` : `d${Math.floor(at / DAY_MS)}`;
    if (row.docVersion === latestDocVersion || !filledBuckets.has(bucket)) {
      filledBuckets.add(bucket);
      continue;
    }
    doomed.push(row.id);
  }
  return doomed;
}

export function nextDocVersion(latest: number | null): number {
  return (latest ?? 0) + 1;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

@Injectable()
export class SnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SnapshotService.name);
  private timers: NodeJS.Timeout[] = [];
  /** Last board visited by the previous bounded sweep; the next one resumes after it. */
  private pruneResumeAfter: string | undefined;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every real change inserts a full snapshot, so history is thinned in-process
   * on a timer (no extra infra). With several instances each one sweeps; the
   * deletes are idempotent, so overlap only costs a few cheap queries.
   */
  onModuleInit(): void {
    const first = setTimeout(() => void this.pruneSafely(), FIRST_PRUNE_DELAY_MS);
    const every = setInterval(() => void this.pruneSafely(), SNAPSHOT_PRUNE_INTERVAL_MS);
    // A timer must never keep the process (or a test run) alive on shutdown.
    first.unref();
    every.unref();
    this.timers = [first, every];
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  async pruneSafely(): Promise<void> {
    try {
      const { boards, deleted } = await this.pruneHistory();
      if (deleted > 0) this.logger.log(`Pruned ${deleted} snapshots across ${boards} boards`);
    } catch (err) {
      this.logger.warn(`Snapshot prune failed: ${(err as Error).message}`);
    }
  }

  /**
   * One bounded sweep: at most `maxBoards` boards that have thinnable history,
   * resuming after the board the previous sweep stopped at (wrapping around),
   * and at most `maxRowsPerBoard` of each board's oldest candidates.
   */
  async pruneHistory(now: Date = new Date(), limits: PruneLimits = {}): Promise<{ boards: number; deleted: number }> {
    const maxBoards = limits.maxBoards ?? PRUNE_BOARDS_PER_RUN;
    const maxRows = limits.maxRowsPerBoard ?? PRUNE_ROWS_PER_BOARD;
    const cutoff = new Date(now.getTime() - RETAIN_ALL_MS);
    const groups = await this.prisma.boardSnapshot.groupBy({
      by: ['boardId'],
      where: {
        reason: 'autosave',
        createdAt: { lt: cutoff },
        ...(this.pruneResumeAfter && { boardId: { gt: this.pruneResumeAfter } }),
      },
      orderBy: { boardId: 'asc' },
      take: maxBoards,
    });
    this.pruneResumeAfter = groups.length === maxBoards ? groups[groups.length - 1]?.boardId : undefined;

    let deleted = 0;
    for (const { boardId } of groups) deleted += await this.pruneBoard(boardId, now, maxRows);
    return { boards: groups.length, deleted };
  }

  private async pruneBoard(boardId: string, now: Date, maxRows: number): Promise<number> {
    const latest = await this.prisma.boardSnapshot.findFirst({
      where: { boardId },
      orderBy: { docVersion: 'desc' },
      select: { docVersion: true },
    });
    if (!latest) return 0;
    const rows = await this.prisma.boardSnapshot.findMany({
      where: { boardId, reason: 'autosave', createdAt: { lt: new Date(now.getTime() - RETAIN_ALL_MS) } },
      orderBy: [{ createdAt: 'asc' }, { docVersion: 'asc' }],
      take: maxRows,
      select: { id: true, docVersion: true, reason: true, createdAt: true },
    });
    const doomed = selectSnapshotsToPrune(rows, now, latest.docVersion);
    let deleted = 0;
    for (let i = 0; i < doomed.length; i += PRUNE_DELETE_CHUNK) {
      // The reason/latest filters repeat the selection's guarantees at the
      // database, so a logic slip can never delete a checkpoint or the head.
      const { count } = await this.prisma.boardSnapshot.deleteMany({
        where: {
          boardId,
          id: { in: doomed.slice(i, i + PRUNE_DELETE_CHUNK) },
          reason: 'autosave',
          docVersion: { not: latest.docVersion },
        },
      });
      deleted += count;
    }
    return deleted;
  }

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
   *
   * A saved snapshot is a content edit, so the board's `updatedAt` moves too;
   * otherwise only renames would count as edits on the dashboard. Saves are
   * already debounced, so this costs one cheap update per flush.
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
        await this.markEdited(boardId);
        return docVersion;
      } catch (err) {
        if (!isUniqueViolation(err) || attempt >= MAX_VERSION_ATTEMPTS) throw err;
      }
    }
  }

  /**
   * Cosmetic next to the snapshot itself: a failure is logged, never thrown,
   * so a caller cannot retry and write the same state twice. updateMany so a
   * board purged meanwhile is a no-op rather than an error.
   */
  private async markEdited(boardId: string): Promise<void> {
    try {
      await this.prisma.board.updateMany({ where: { id: boardId }, data: { updatedAt: new Date() } });
    } catch (err) {
      this.logger.warn(`Board ${boardId} saved but its updatedAt was not bumped: ${(err as Error).message}`);
    }
  }
}
