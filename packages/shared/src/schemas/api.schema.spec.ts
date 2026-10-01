import { describe, expect, it } from 'vitest';
import { errorEnvelopeSchema } from './api.schema';
import { presignedUploadSchema } from './storage.schema';
import { inviteAcceptedSchema } from './invite.schema';
import { versionRestoredSchema } from './board.schema';

describe('API response schemas', () => {
  it('accepts an error envelope with a single message or a validation list', () => {
    expect(errorEnvelopeSchema.safeParse({ statusCode: 404, error: 'Not Found', message: 'no' }).success).toBe(true);
    expect(
      errorEnvelopeSchema.safeParse({ statusCode: 422, error: 'Unprocessable Entity', message: ['a', 'b'], requestId: 'r' })
        .success,
    ).toBe(true);
    expect(errorEnvelopeSchema.safeParse({ statusCode: 'x', error: 'e', message: 'm' }).success).toBe(false);
  });

  it('describes the presign, invite-accept and restore bodies', () => {
    expect(
      presignedUploadSchema.safeParse({ uploadUrl: 'https://s3/x', assetUrl: 'https://s3/y', key: 'boards/b/k' }).success,
    ).toBe(true);
    expect(
      inviteAcceptedSchema.safeParse({ boardId: '7f0c1b9e-1f5e-4c7a-9f39-1b2c3d4e5f60', role: 'editor' }).success,
    ).toBe(true);
    expect(inviteAcceptedSchema.safeParse({ boardId: 'nope', role: 'editor' }).success).toBe(false);
    expect(versionRestoredSchema.safeParse({ ok: true, docVersion: 3 }).success).toBe(true);
  });
});
