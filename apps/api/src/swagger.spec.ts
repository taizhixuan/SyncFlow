import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { buildOpenApiDocument } from './swagger';

type JsonObject = Record<string, unknown>;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface Operation {
  key: string;
  responses: Record<string, JsonObject>;
}

function operations(document: OpenAPIObject): Operation[] {
  const found: Operation[] = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const op = (item as JsonObject)[method] as
        | { responses?: Record<string, JsonObject> }
        | undefined;
      if (op) found.push({ key: `${method.toUpperCase()} ${path}`, responses: op.responses ?? {} });
    }
  }
  return found;
}

function collectRefs(node: unknown, refs: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((child) => collectRefs(child, refs));
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') refs.add(value);
      else collectRefs(value, refs);
    }
  }
  return refs;
}

function jsonSchemaOf(response: unknown): JsonObject | undefined {
  const content = (response as JsonObject | undefined)?.content as
    | Record<string, { schema?: JsonObject }>
    | undefined;
  return content?.['application/json']?.schema;
}

function component(document: OpenAPIObject, name: string): JsonObject {
  const schema = document.components?.schemas?.[name] as JsonObject | undefined;
  if (!schema) throw new Error(`Missing component schema ${name}`);
  return schema;
}

describe('OpenAPI document', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    // Preview mode never connects to these; config validation just needs them set.
    process.env.WEB_ORIGIN ??= 'http://localhost:5173';
    process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/syncflow';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    const { AppModule } = await import('./app.module');
    app = await NestFactory.create(AppModule, { preview: true, logger: false });
    document = buildOpenApiDocument(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents a success response for every operation', () => {
    const ops = operations(document);
    expect(ops.length).toBeGreaterThan(0);
    const undocumented = ops.filter(({ responses }) => {
      const success = Object.entries(responses).filter(([status]) => /^2\d\d$/.test(status));
      if (success.length === 0) return true;
      return !success.some(([status, res]) => status === '204' || jsonSchemaOf(res) !== undefined);
    });
    expect(undocumented.map((op) => op.key)).toEqual([]);
  });

  it('declares security (or an explicit public requirement) on every operation', () => {
    const undeclared: string[] = [];
    for (const [path, item] of Object.entries(document.paths)) {
      for (const method of HTTP_METHODS) {
        const op = item[method];
        if (op && !op.security?.length) undeclared.push(`${method.toUpperCase()} ${path}`);
      }
    }
    expect(undeclared).toEqual([]);
    expect(document.paths['/boards']?.get?.security).toEqual([{ 'access-token': [] }]);
    expect(document.paths['/invites/{token}']?.get?.security).toEqual([{}]);
  });

  it('documents 204 responses without a body', () => {
    const withBody = operations(document).filter(
      ({ responses }) => responses['204'] !== undefined && responses['204'].content !== undefined,
    );
    expect(withBody.map((op) => op.key)).toEqual([]);
  });

  it('resolves every $ref to an existing component', () => {
    const schemas = document.components?.schemas ?? {};
    const dangling = [...collectRefs(document)].filter((ref) => {
      const match = /^#\/components\/schemas\/(.+)$/.exec(ref);
      return !match?.[1] || !(match[1] in schemas);
    });
    expect(dangling).toEqual([]);
  });

  it('describes GET /boards as a paginated board list', () => {
    const op = document.paths['/boards']?.get;
    expect(jsonSchemaOf(op?.responses['200'])).toEqual({
      $ref: '#/components/schemas/BoardListResponse',
    });
    const list = component(document, 'BoardListResponse');
    expect(list.required).toEqual(expect.arrayContaining(['items', 'nextCursor']));
    const props = list.properties as Record<string, JsonObject>;
    expect(props.items?.items).toEqual({ $ref: '#/components/schemas/Board' });
    expect(props.nextCursor).toMatchObject({ type: 'string', nullable: true });
  });

  it('includes createdByName on version history items', () => {
    const op = document.paths['/boards/{id}/versions']?.get;
    expect(jsonSchemaOf(op?.responses['200'])).toEqual({
      $ref: '#/components/schemas/BoardVersionList',
    });
    const version = component(document, 'BoardVersion');
    expect(Object.keys(version.properties as JsonObject)).toContain('createdByName');
    expect(version.required).toContain('createdByName');
  });

  it('points error responses at the shared error envelope', () => {
    const errorRef = { $ref: '#/components/schemas/ErrorEnvelope' };
    const accept = document.paths['/invites/{token}/accept']?.post?.responses ?? {};
    expect(jsonSchemaOf(accept['410'])).toEqual(errorRef);
    expect(jsonSchemaOf(accept['401'])).toEqual(errorRef);
    const signup = document.paths['/auth/signup']?.post?.responses ?? {};
    expect(jsonSchemaOf(signup['409'])).toEqual(errorRef);
    expect(jsonSchemaOf(signup['422'])).toEqual(errorRef);
    expect(Object.keys(component(document, 'ErrorEnvelope').properties as JsonObject)).toEqual(
      expect.arrayContaining(['statusCode', 'error', 'message', 'requestId']),
    );
  });
});
