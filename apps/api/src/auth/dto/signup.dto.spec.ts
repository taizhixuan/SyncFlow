import { HttpStatus, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { SignupDto } from './signup.dto';

// Same options as configureApp, so these cases see exactly what a request does.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
});

const parse = (body: unknown): Promise<SignupDto> =>
  pipe.transform(body, { type: 'body', metatype: SignupDto }) as Promise<SignupDto>;

const VALID = { email: 'maya@syncflow.app', password: 'long-enough', displayName: 'Maya' };

describe('SignupDto', () => {
  it('trims displayName, like a profile edit does', async () => {
    await expect(parse({ ...VALID, displayName: '  Maya  ' })).resolves.toMatchObject({
      displayName: 'Maya',
    });
  });

  it('rejects a whitespace-only displayName with 422', async () => {
    await expect(parse({ ...VALID, displayName: '   ' })).rejects.toThrow(
      UnprocessableEntityException,
    );
  });
});
