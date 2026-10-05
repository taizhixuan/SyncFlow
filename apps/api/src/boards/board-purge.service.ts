import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { boardAssetPrefix } from '../storage/storage.helpers';
import { StorageService } from '../storage/storage.service';

const DAY_MS = 24 * 60 * 60 * 1000;
export const BOARD_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
// First sweep shortly after boot, not during it, so startup stays fast; a
// frequently restarted instance still purges.
export const FIRST_PURGE_DELAY_MS = 5 * 60 * 1000;
// Each board costs at least one S3 round trip, so a run stays short and a
// backlog drains over successive runs.
const PURGE_BOARDS_PER_RUN = 50;

export interface PurgeOptions {
  maxBoards?: number;
}

export interface PurgeResult {
  purged: number;
  failed: number;
}

/**
 * Hard-deletes boards that have been soft-deleted for longer than
 * BOARD_PURGE_AFTER_DAYS, together with their uploaded images. Members,
 * snapshots and invites go with the row via `onDelete: Cascade`.
 *
 * Only images keyed `boards/{boardId}/...` are removed. Legacy uploads keyed by
 * user (before uploads were board-scoped) can't be attributed to a board and
 * are left in the bucket.
 *
 * Runs in-process on a timer (no extra infra). With several instances each one
 * sweeps; prefix deletes and the guarded row delete are idempotent, so overlap
 * only costs a few redundant calls.
 */
@Injectable()
export class BoardPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BoardPurgeService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  onModuleInit(): void {
    // A destructive job must not fire on its own mid-suite; e2e tests call
    // purgeExpired directly with a fixed clock.
    if (this.config.get('nodeEnv', { infer: true }) === 'test') return;
    const first = setTimeout(() => void this.purgeSafely(), FIRST_PURGE_DELAY_MS);
    const every = setInterval(() => void this.purgeSafely(), BOARD_PURGE_INTERVAL_MS);
    // A timer must never keep the process (or a test run) alive on shutdown.
    first.unref();
    every.unref();
    this.timers = [first, every];
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  async purgeSafely(): Promise<void> {
    try {
      const { purged, failed } = await this.purgeExpired();
      if (purged > 0) this.logger.log(`Purged ${purged} soft-deleted boards`);
      if (failed > 0)
        this.logger.warn(`${failed} soft-deleted boards could not be purged; retrying next run`);
    } catch (err) {
      this.logger.warn(`Board purge failed: ${(err as Error).message}`);
    }
  }

  /**
   * One bounded sweep over the oldest expired boards. Assets go first: if that
   * fails the board stays soft-deleted and is retried next run, so its images
   * are never orphaned without a row pointing at them.
   */
  async purgeExpired(now: Date = new Date(), options: PurgeOptions = {}): Promise<PurgeResult> {
    const retentionDays = this.config.get('boardPurgeAfterDays', { infer: true });
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    const boards = await this.prisma.board.findMany({
      where: { deletedAt: { lt: cutoff } },
      orderBy: { deletedAt: 'asc' },
      take: options.maxBoards ?? PURGE_BOARDS_PER_RUN,
      select: { id: true },
    });

    const result: PurgeResult = { purged: 0, failed: 0 };
    for (const { id } of boards) {
      try {
        await this.storage.deletePrefix(boardAssetPrefix(id));
      } catch (err) {
        result.failed += 1;
        this.logger.warn(`Keeping board ${id}: asset delete failed: ${(err as Error).message}`);
        continue;
      }
      try {
        // Re-checking the cutoff means a board restored meanwhile is never
        // dropped; count 0 means another instance already purged it.
        const { count } = await this.prisma.board.deleteMany({
          where: { id, deletedAt: { lt: cutoff } },
        });
        result.purged += count;
      } catch (err) {
        result.failed += 1;
        this.logger.warn(`Board ${id} row delete failed: ${(err as Error).message}`);
      }
    }
    return result;
  }
}
