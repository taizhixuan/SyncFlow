import type { OpenAPIObject } from '@nestjs/swagger';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  authResponseSchema,
  boardInviteListResponseSchema,
  boardInviteSummarySchema,
  boardListResponseSchema,
  boardMemberListResponseSchema,
  boardMemberSchema,
  boardRoleSchema,
  boardSchema,
  boardVersionSchema,
  dependencyStateSchema,
  errorEnvelopeSchema,
  healthStatusSchema,
  inviteAcceptedSchema,
  inviteCreatedSchema,
  inviteKindSchema,
  invitePreviewSchema,
  okResponseSchema,
  presignedUploadSchema,
  userPublicSchema,
  versionRestoredSchema,
} from '@syncflow/shared';

type ComponentSchema = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>[string];

/**
 * Every schema published under `#/components/schemas`, keyed by component
 * name. A schema nested inside another one (a Board inside a BoardListResponse)
 * is emitted as a `$ref` to its own component rather than inlined twice.
 */
const RESPONSE_SCHEMAS = {
  UserPublic: userPublicSchema,
  AuthResponse: authResponseSchema,
  BoardRole: boardRoleSchema,
  Board: boardSchema,
  BoardListResponse: boardListResponseSchema,
  BoardMember: boardMemberSchema,
  BoardMemberListResponse: boardMemberListResponseSchema,
  InviteKind: inviteKindSchema,
  InviteCreated: inviteCreatedSchema,
  InvitePreview: invitePreviewSchema,
  InviteAccepted: inviteAcceptedSchema,
  BoardInviteSummary: boardInviteSummarySchema,
  BoardInviteListResponse: boardInviteListResponseSchema,
  BoardVersion: boardVersionSchema,
  BoardVersionList: z.array(boardVersionSchema),
  VersionRestored: versionRestoredSchema,
  OkResponse: okResponseSchema,
  PresignedUpload: presignedUploadSchema,
  DependencyState: dependencyStateSchema,
  HealthStatus: healthStatusSchema,
  ErrorEnvelope: errorEnvelopeSchema,
} satisfies Record<string, z.ZodTypeAny>;

export type ResponseSchemaName = keyof typeof RESPONSE_SCHEMAS;

const DEFINITION_PATH = 'components/schemas';

/** `#/components/schemas/<name>`, the reference a response decorator points at. */
export function responseSchemaRef(name: ResponseSchemaName): { $ref: string } {
  return { $ref: `#/${DEFINITION_PATH}/${name}` };
}

/*
 * zod-to-json-schema types its input against `zod/v3`, which under this
 * repo's node10 module resolution is a separate declaration copy from the
 * `zod` entry the shared package compiles against. tsc then compares the two
 * structurally and gives up (TS2589), so call it through a plain signature.
 */
const convert = zodToJsonSchema as unknown as (
  schema: z.ZodTypeAny,
  options: {
    target: 'openApi3';
    $refStrategy: 'root';
    basePath: string[];
    definitionPath: string;
    definitions: Record<string, z.ZodTypeAny>;
  },
) => Record<string, unknown>;

let converted: Record<string, ComponentSchema> | undefined;

/** The registry converted to OpenAPI 3 schema objects (computed once). */
export function responseComponentSchemas(): Record<string, ComponentSchema> {
  if (converted) return converted;
  // One pass with every schema as a named definition: each definition's top
  // level is expanded, and any registered schema nested inside it becomes a
  // $ref into components. The root schema is a throwaway; only the
  // definitions are kept.
  const json = convert(z.null(), {
    target: 'openApi3',
    $refStrategy: 'root',
    basePath: ['#'],
    definitionPath: DEFINITION_PATH,
    definitions: RESPONSE_SCHEMAS,
  });
  converted = json[DEFINITION_PATH] as Record<string, ComponentSchema>;
  return converted;
}

/** Add every registered response schema to the document's components. */
export function registerResponseSchemas(document: OpenAPIObject): OpenAPIObject {
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...responseComponentSchemas() },
  };
  return document;
}
