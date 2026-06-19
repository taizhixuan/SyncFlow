import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/configuration';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const url = this.config.get('redisUrl', { infer: true });
    // lazyConnect + retry so a brief Redis outage doesn't crash boot.
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    this.client.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
    this.client.connect().then(
      () => this.logger.log('Connected to Redis'),
      (err) => this.logger.warn(`Redis not reachable at boot: ${(err as Error).message}`),
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => this.client.disconnect());
    }
  }

  /** Underlying client for downstream modules (pub/sub, presence) in later phases. */
  getClient(): Redis {
    return this.client;
  }

  /** True if Redis answers PING. */
  async isHealthy(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
