import { UnsupportedMediaTypeException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { JsonBodyGuard } from './json-body.guard';

function contextFor(req: Partial<Request>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

/** Stand-in for express's `req.is`: null when there is no body, else whether the type matches. */
function requestWith(contentType: string | undefined): Partial<Request> {
  return {
    is: ((type: string) => {
      if (contentType === undefined) return null;
      return contentType.startsWith(type) ? type : false;
    }) as Request['is'],
  };
}

describe('JsonBodyGuard', () => {
  const guard = new JsonBodyGuard();

  it('lets a JSON body through', () => {
    const json = requestWith('application/json; charset=utf-8');
    expect(guard.canActivate(contextFor(json))).toBe(true);
  });

  it('lets a bodyless request reach validation (which answers 422)', () => {
    expect(guard.canActivate(contextFor(requestWith(undefined)))).toBe(true);
  });

  it.each(['application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain'])(
    'rejects a %s body, the only types a cross-site form can send (415)',
    (type) => {
      expect(() => guard.canActivate(contextFor(requestWith(type)))).toThrow(
        UnsupportedMediaTypeException,
      );
    },
  );
});
