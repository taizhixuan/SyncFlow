import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import { API_PREFIX } from '@syncflow/shared';
import type { LogLevel } from '../../config/configuration';

export const REQUEST_ID_HEADER = 'x-request-id';

// Accept a caller/proxy-supplied id only if it is short and log-safe; anything
// else could forge or bloat log lines.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Correlation id for a request: reuse an upstream `x-request-id` (e.g. set by
 * a proxy or an API client) when it is well-formed, otherwise mint one (the web
 * app doesn't send one). It is echoed on the response so users can quote it,
 * and it lands in every log line and error envelope for this request.
 */
export function requestIdFor(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

// An invite link is a bearer credential: whoever holds /invites/<token> can
// join the board. Board-scoped invite routes carry only an invite id, so just
// the top-level /invites/<token> segment is masked.
const INVITE_TOKEN_IN_URL = new RegExp(`^(/${API_PREFIX}/invites/)[^/?#]+`);
const REDACTED = '[redacted]';

/** The request URL with any credential in its path masked, safe to log. */
export function redactRequestUrl(url: string): string {
  return url.replace(INVITE_TOKEN_IN_URL, `$1${REDACTED}`);
}

/**
 * pino-http hands this the already-serialized request (`url`, `params`, …);
 * mask the invite token wherever it appears in it.
 */
function redactRequest(req: Record<string, unknown>): Record<string, unknown> {
  const out = { ...req };
  if (typeof out.url === 'string') out.url = redactRequestUrl(out.url);
  const params = out.params;
  if (params && typeof params === 'object' && 'token' in params) {
    out.params = { ...params, token: REDACTED };
  }
  return out;
}

/** nestjs-pino options derived from validated config. */
export function pinoOptions(logLevel: LogLevel): Params {
  return {
    pinoHttp: {
      level: logLevel,
      genReqId: requestIdFor,
      // Bearer tokens, the refresh cookie and invite tokens are credentials;
      // never log them.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: REDACTED,
      },
      serializers: { req: redactRequest },
      // Health probes fire every few seconds and would drown real traffic.
      autoLogging: { ignore: (req) => (req.url ?? '').includes('/health/') },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    },
  };
}
