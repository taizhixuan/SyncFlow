import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './swagger';

/**
 * Emit a static `docs/openapi.json` for the REST surface.
 *
 * Runs in NestFactory preview mode: the module graph is constructed so routes
 * can be scanned, but provider constructors and lifecycle hooks never fire — so
 * this needs no Postgres, Redis, or S3 and is safe to run in CI.
 */
async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });

  const document = buildOpenApiDocument(app);

  // cwd is apps/api when invoked via the workspace script; emit to repo-root docs/.
  const outDir = resolve(process.cwd(), '..', '..', 'docs');
  mkdirSync(outDir, { recursive: true });
  const outFile = resolve(outDir, 'openapi.json');
  writeFileSync(outFile, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();
  console.log(`OpenAPI spec written to ${outFile}`);
}

void generate();
