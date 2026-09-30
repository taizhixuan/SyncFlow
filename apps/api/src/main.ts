import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX } from '@syncflow/shared';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';
import type { AppConfig } from './config/configuration';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  // Buffer boot logs until the Pino logger is installed, so they come out as
  // structured JSON like everything else.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);

  const config = app.get(ConfigService<AppConfig, true>);
  const swaggerEnabled = config.get('swaggerEnabled', { infer: true });
  if (swaggerEnabled) setupSwagger(app);

  const port = config.get('port', { infer: true });
  await app.listen(port);
  const log = new Logger('Bootstrap');
  log.log(`SyncFlow API listening on http://localhost:${port}/${API_PREFIX}`);
  if (swaggerEnabled) {
    log.log(`API docs (Swagger UI) at http://localhost:${port}/${API_PREFIX}/docs`);
  }
}

bootstrap().catch((err: unknown) => {
  // Without this the rejection is unhandled, and Node prints a bare stack trace
  // instead of the reason the API could not start (port in use, bad config).
  new Logger('Bootstrap').error(
    `Failed to start: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
