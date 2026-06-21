import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@syncflow/shared';

/**
 * Build the OpenAPI 3 document describing SyncFlow's REST surface.
 *
 * Route and DTO schemas are discovered automatically: the `@nestjs/swagger`
 * CLI plugin (configured in `nest-cli.json`) reads the class-validator DTOs and
 * controller signatures at build time, so this stays free of per-endpoint
 * decoration. Shared with the static-spec generator (`openapi.ts`) so the live
 * docs and the emitted `openapi.json` can never drift.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('SyncFlow API')
    .setDescription(
      'REST surface for SyncFlow — authentication, boards, membership, invites, ' +
        'image storage, and version history. Realtime canvas state syncs over ' +
        'the WebSocket gateway and is documented separately.',
    )
    .setVersion('0.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addCookieAuth('refresh_token')
    .addServer(`/${API_PREFIX}`)
    .build();

  return SwaggerModule.createDocument(app, config);
}

/**
 * Serve interactive Swagger UI at `/<API_PREFIX>/docs` with the raw spec at
 * `/<API_PREFIX>/docs-json`. Called from `main.ts` only — kept out of the e2e
 * bootstrap so tests don't pay the document-scan cost.
 */
export function setupSwagger(app: INestApplication): void {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup(`${API_PREFIX}/docs`, app, document, {
    jsonDocumentUrl: `${API_PREFIX}/docs-json`,
    swaggerOptions: { persistAuthorization: true },
  });
}
