import type { ArgumentsHost } from '@nestjs/common';
import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter, type ErrorEnvelope } from './all-exceptions.filter';

interface Captured {
  status?: number;
  body?: ErrorEnvelope;
}

function hostFor(captured: Captured, type = 'http'): ArgumentsHost {
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
  const req = { id: 'req-1', method: 'GET', originalUrl: '/api/v1/x' };
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
});
