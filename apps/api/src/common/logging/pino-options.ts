import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
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

/** nestjs-pino options derived from validated config. */
export function pinoOptions(logLevel: LogLevel): Params {
  return {
    pinoHttp: {
      level: logLevel,
      genReqId: requestIdFor,
      // Bearer tokens and the refresh cookie are credentials; never log them.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        censor: '[redacted]',
      },
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
