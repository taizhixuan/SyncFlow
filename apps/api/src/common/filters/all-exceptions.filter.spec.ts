import type { ArgumentsHost } from '@nestjs/common';
import { ForbiddenException, Logger, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter, type ErrorEnvelope } from './all-exceptions.filter';

interface Captured {
  status?: number;
  body?: ErrorEnvelope;
}

function hostFor(captured: Captured, type = 'http', originalUrl = '/api/v1/x'): ArgumentsHost {
  const res = {
    headersSent: false,
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: ErrorEnvelope) {
      captured.body = body;
      return this;
    },
  };
  const req = { id: 'req-1', method: 'GET', originalUrl };
  return {
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
}

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom at /secret/path.ts', {
    code,
    clientVersion: 'test',
  });
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('wraps HttpExceptions in the envelope with the request id', () => {
    const captured: Captured = {};
    filter.catch(new ForbiddenException('Nope'), hostFor(captured));
    expect(captured.status).toBe(403);
    expect(captured.body).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Nope',
      requestId: 'req-1',
    });
  });

  it('keeps validation message arrays intact', () => {
    const captured: Captured = {};
    filter.catch(new UnprocessableEntityException(['a must be x', 'b must be y']), hostFor(captured));
    expect(captured.body?.message).toEqual(['a must be x', 'b must be y']);
    expect(captured.body?.error).toBe('Unprocessable Entity');
  });

  it.each([
    ['P2025', 404],
    ['P2002', 409],
    ['P2023', 400],
  ])('maps Prisma %s to %i without leaking the driver message', (code, status) => {
    const captured: Captured = {};
    filter.catch(prismaError(code), hostFor(captured));
    expect(captured.status).toBe(status);
    expect(JSON.stringify(captured.body)).not.toContain('/secret/path.ts');
  });

  it('turns unknown errors into a bare 500 with no stack or message leak', () => {
    const captured: Captured = {};
    filter.catch(new Error('db password is hunter2'), hostFor(captured));
    expect(captured.status).toBe(500);
    expect(captured.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      requestId: 'req-1',
    });
  });

  // body-parser raises http-errors (413 too large, 415 charset, 400 aborted or
  // malformed JSON). They are the client's fault and say so via `expose`.
  it.each([
    [413, 'request entity too large'],
    [415, 'unsupported charset "UTF-7"'],
    [400, 'request aborted'],
  ])('keeps a body-parser %i as that status instead of a 500', (status, message) => {
    const error = Object.assign(new Error(message), { status, statusCode: status, expose: true });
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const captured: Captured = {};
    filter.catch(error, hostFor(captured));
    expect(captured.status).toBe(status);
    expect(captured.body?.message).toBe(message);
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it('still hides a 4xx-looking error that does not ask to be exposed', () => {
    const error = Object.assign(new Error('internal detail'), { status: 400, expose: false });
    const captured: Captured = {};
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(error, hostFor(captured));
    expect(captured.status).toBe(500);
    expect(captured.body?.message).toBe('Internal server error');
    jest.restoreAllMocks();
  });

  it('never logs an invite token (a bearer credential) from the URL', () => {
    const logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const url = '/api/v1/invites/s3cret-invite-token/accept';
    filter.catch(new Error('boom'), hostFor({}, 'http', url));
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).not.toContain('s3cret-invite-token');
    expect(line).toContain('/api/v1/invites/[redacted]/accept');
    logged.mockRestore();
  });
});
