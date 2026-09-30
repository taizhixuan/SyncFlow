import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Every rotation leaves a row behind; sweep often enough that the table stays small. */
export const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Deletes refresh-token rows that can no longer matter.
 *
 * Revoked rows are deliberately kept until they expire: a spent token must stay
 * recognisable so a replay triggers reuse detection. Once expired, `refresh`
 * rejects it before reuse detection runs, so the row is dead weight.
 *
 * Runs in-process on a timer (no extra infra). With several instances each one
 * sweeps; the delete is idempotent, so overlap only costs a cheap query.
 */
@Injectable()
export class RefreshTokenPrunerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RefreshTokenPrunerService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.pruneSafely(), PRUNE_INTERVAL_MS);
    // A timer must never keep the process (or a test run) alive on shutdown.
    this.timer.unref();
    void this.pruneSafely();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async prune(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return count;
  }

  private async pruneSafely(): Promise<void> {
    try {
      const count = await this.prune();
      if (count > 0) this.logger.log(`Pruned ${count} expired refresh tokens`);
    } catch (err) {
      this.logger.warn(`Refresh-token prune failed: ${(err as Error).message}`);
    }
  }
}
