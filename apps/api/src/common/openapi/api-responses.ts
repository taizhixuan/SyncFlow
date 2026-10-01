import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { responseSchemaRef, type ResponseSchemaName } from './response-schemas';

/** Document a JSON response whose body is a registered (zod-derived) component. */
export function ApiZodResponse(
  status: HttpStatus,
  schema: ResponseSchemaName,
  description: string,
): MethodDecorator & ClassDecorator {
  return ApiResponse({ status, description, schema: responseSchemaRef(schema) });
}

/** Document a 204 with no body. */
export function ApiNoContent(description: string): MethodDecorator & ClassDecorator {
  return ApiResponse({ status: HttpStatus.NO_CONTENT, description });
}

export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429;

const ERROR_DESCRIPTIONS: Record<ApiErrorStatus, string> = {
  400: 'Malformed identifier or cursor, or a request the current state rejects',
  401: 'Missing, invalid, expired or revoked credentials',
  403: 'Not allowed: not a member, insufficient role, or untrusted origin',
  404: 'The resource does not exist (or was deleted)',
  409: 'Conflicts with the current state',
  410: 'The invite has expired or was already used',
  422: 'The request body or query failed validation',
  429: 'Rate limit exceeded',
};

/**
 * Document the error responses a route can return, each with the global
 * exception filter's envelope as its body. Pass a description to override the
 * generic one where the route has a specific cause worth naming.
 */
export function ApiErrors(
  ...statuses: (ApiErrorStatus | [ApiErrorStatus, string])[]
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ...statuses.map((entry) => {
      const [status, description] = Array.isArray(entry)
        ? entry
        : [entry, ERROR_DESCRIPTIONS[entry]];
      return ApiResponse({ status, description, schema: responseSchemaRef('ErrorEnvelope') });
    }),
  );
}
