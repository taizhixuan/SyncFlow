import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { configuration, envFilePaths, type AppConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { pinoOptions } from './common/logging/pino-options';
import { RedisThrottlerStorage } from './common/throttler/redis-throttler.storage';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BoardsModule } from './boards/boards.module';
import { BoardSyncModule } from './modules/board-sync/board-sync.module';
import { InvitesModule } from './invites/invites.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Single root .env in dev; in containers, vars come from the environment.
      envFilePath: envFilePaths(),
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        pinoOptions(config.get('logLevel', { infer: true })),
    }),
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisService],
      useFactory: (config: ConfigService<AppConfig, true>, redis: RedisService) => ({
        // Generous default cap; credential routes tighten this further (NFR-SEC-5).
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage:
          config.get('throttleStorage', { infer: true }) === 'redis'
            ? new RedisThrottlerStorage(() => redis.getClient())
            : undefined,
      }),
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    BoardsModule,
    BoardSyncModule,
    InvitesModule,
    StorageModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
