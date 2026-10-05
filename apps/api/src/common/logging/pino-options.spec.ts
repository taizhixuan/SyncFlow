import type { Options } from 'pino-http';
import { pinoOptions, redactRequestUrl } from './pino-options';

describe('redactRequestUrl', () => {
  it.each([
    ['/api/v1/invites/abc123', '/api/v1/invites/[redacted]'],
    ['/api/v1/invites/abc123/accept', '/api/v1/invites/[redacted]/accept'],
    ['/api/v1/invites/abc123?ref=mail', '/api/v1/invites/[redacted]?ref=mail'],
  ])('masks the invite token in %s', (url, expected) => {
    expect(redactRequestUrl(url)).toBe(expected);
  });

  it.each(['/api/v1/boards/b1/invites', '/api/v1/boards/b1/invites/i1', '/api/v1/users/me'])(
    'leaves %s alone (no credential in it)',
    (url) => {
      expect(redactRequestUrl(url)).toBe(url);
    },
  );
});

describe('pinoOptions request serializer', () => {
  const serializeReq = (pinoOptions('info').pinoHttp as Options).serializers!.req as (
    req: Record<string, unknown>,
  ) => Record<string, unknown>;

  it('masks the invite token in both the url and the route params', () => {
    const out = serializeReq({
      method: 'POST',
      url: '/api/v1/invites/s3cret/accept',
      params: { token: 's3cret' },
    });
    expect(JSON.stringify(out)).not.toContain('s3cret');
    expect(out.url).toBe('/api/v1/invites/[redacted]/accept');
    expect(out.params).toEqual({ token: '[redacted]' });
  });

  it('passes other requests through unchanged', () => {
    const req = { method: 'GET', url: '/api/v1/boards/b1', params: { id: 'b1' } };
    expect(serializeReq(req)).toEqual(req);
  });
});
