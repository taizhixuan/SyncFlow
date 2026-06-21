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
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  configureApp(app);
  setupSwagger(app);

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });
  await app.listen(port);
  const log = new Logger('Bootstrap');
  log.log(`SyncFlow API listening on http://localhost:${port}/${API_PREFIX}`);
  log.log(`API docs (Swagger UI) at http://localhost:${port}/${API_PREFIX}/docs`);
}

void bootstrap();
