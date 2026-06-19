import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { API_PREFIX } from '@syncflow/shared';
import type { AppConfig } from './config/configuration';

/**
 * Shared application configuration applied identically in production
 * (main.ts) and e2e tests, so the two never drift.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<AppConfig, true>);

  app.setGlobalPrefix(API_PREFIX);
  app.enableCors({ origin: config.get('webOrigins', { infer: true }), credentials: true });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    }),
  );
  app.enableShutdownHooks();
}
