import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/** JSON error envelope — matches `components.schemas.Error` in the API contract. */
export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId?: string;
}

interface Mapped {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/** Prisma errors that are really the caller's fault, not a server fault. */
const PRISMA_STATUS: Record<string, { statusCode: number; message: string }> = {
  P2025: { statusCode: HttpStatus.NOT_FOUND, message: 'Resource not found' },
  P2002: { statusCode: HttpStatus.CONFLICT, message: 'Resource already exists' },
  // Inconsistent column data — e.g. a malformed UUID reaching a @db.Uuid column.
  P2023: { statusCode: HttpStatus.BAD_REQUEST, message: 'Malformed identifier' },
};

function reasonPhrase(statusCode: number): string {
  const name = HttpStatus[statusCode];
  if (typeof name !== 'string') return 'Error';
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function fromHttpException(exception: HttpException): Mapped {
  const statusCode = exception.getStatus();
  const body = exception.getResponse();
  if (typeof body === 'string') return { statusCode, message: body };
  const { message, error } = body as { message?: unknown; error?: unknown };
  const normalised =
    typeof message === 'string' || (Array.isArray(message) && message.every((m) => typeof m === 'string'))
      ? (message as string | string[])
      : exception.message;
  return { statusCode, message: normalised, error: typeof error === 'string' ? error : undefined };
}

/**
 * Global HTTP exception filter: every error leaves the API in one envelope
 * with the request's correlation id, so a user-visible failure can be matched
 * to its log line. Stack traces are logged, never returned.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    // Gateways have their own error channel; this filter only shapes HTTP.
    if (host.getType() !== 'http') throw exception;

    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: unknown }>();
    const res = ctx.getResponse<Response>();

    const mapped = this.map(exception);
    const requestId = typeof req.id === 'string' || typeof req.id === 'number' ? String(req.id) : undefined;

    if (mapped.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} failed (requestId=${requestId ?? 'n/a'})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (res.headersSent) return;
    const body: ErrorEnvelope = {
      statusCode: mapped.statusCode,
      error: mapped.error ?? reasonPhrase(mapped.statusCode),
      message: mapped.message,
      requestId,
    };
    res.status(mapped.statusCode).json(body);
  }

  private map(exception: unknown): Mapped {
    if (exception instanceof HttpException) return fromHttpException(exception);
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const known = PRISMA_STATUS[exception.code];
      if (known) return known;
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}
