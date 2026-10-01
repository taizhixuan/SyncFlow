import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { API_PREFIX } from '@syncflow/shared';
import { REFRESH_COOKIE } from './auth/auth.constants';
import { ACCESS_TOKEN_SCHEME, REFRESH_COOKIE_SCHEME } from './common/openapi/api-auth';
import { registerResponseSchemas } from './common/openapi/response-schemas';

/**
 * Build the OpenAPI 3 document describing SyncFlow's REST surface.
 *
 * Routes and request DTOs are discovered automatically: the `@nestjs/swagger`
 * CLI plugin (configured in `nest-cli.json`) reads the class-validator DTOs and
 * controller signatures at build time. Response bodies are declared on each
 * route with `ApiZodResponse`/`ApiErrors` and point at components converted
 * from the `@syncflow/shared` zod schemas, so the documented shapes are the
 * same ones the web client validates. Shared with the static-spec generator
 * (`openapi.ts`) so the live docs and the emitted `openapi.json` can never drift.
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
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, ACCESS_TOKEN_SCHEME)
    .addCookieAuth(REFRESH_COOKIE, { type: 'apiKey', in: 'cookie' }, REFRESH_COOKIE_SCHEME)
    .addServer(`/${API_PREFIX}`)
    .build();

  return registerResponseSchemas(SwaggerModule.createDocument(app, config));
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
