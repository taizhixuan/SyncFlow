import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL');
    } catch (error) {
      // Do not crash the app if the DB is briefly unavailable at boot;
      // /health/ready will report it as down until it recovers.
      this.logger.warn(`PostgreSQL not reachable at boot: ${(error as Error).message}`);
    }
  }

  // Not onModuleDestroy: the realtime gateway saves every unsaved room in its
  // own onModuleDestroy, and Nest gives no ordering between modules in that
  // phase — disconnecting there could close the pool mid-save and drop the last
  // seconds of edits on every deploy. onApplicationShutdown runs after all of
  // them have finished.
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }

  /** True if a trivial round-trip to Postgres succeeds. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
