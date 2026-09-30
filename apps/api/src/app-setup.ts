import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { Application } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { API_PREFIX } from '@syncflow/shared';
import type { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Shared application configuration applied identically in production
 * (main.ts) and e2e tests, so the two never drift.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<AppConfig, true>);

  app.useLogger(app.get(Logger));

  const express = app.getHttpAdapter().getInstance() as Application;
  // Behind Render's proxy req.ip would otherwise be the proxy for every client,
  // so the throttler would rate-limit all users as one.
  express.set('trust proxy', config.get('trustProxy', { infer: true }));

  app.use(
    helmet({
      // The API serves JSON, which CSP does not protect; Swagger UI (dev only)
      // relies on inline scripts that a strict CSP would break.
      contentSecurityPolicy: config.get('swaggerEnabled', { infer: true })
        ? false
        : { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );

  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({ origin: config.get('webOrigins', { infer: true }), credentials: true });
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  // SIGTERM (Render redeploys) runs onModuleDestroy hooks so realtime rooms
  // flush their final snapshots before the process exits.
  app.enableShutdownHooks();
}
