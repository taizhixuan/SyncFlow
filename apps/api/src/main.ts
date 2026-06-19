import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX } from '@syncflow/shared';
import { AppModule } from './app.module';
import { configureApp } from './app-setup';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  configureApp(app);

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });
  await app.listen(port);
  new Logger('Bootstrap').log(`SyncFlow API listening on http://localhost:${port}/${API_PREFIX}`);
}

void bootstrap();
