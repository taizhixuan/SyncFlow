import { HttpStatus, UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import { UpdateProfileDto } from './update-profile.dto';

// Same options as configureApp, so these cases see exactly what a request does.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
});

const parse = (body: unknown): Promise<UpdateProfileDto> =>
  pipe.transform(body, { type: 'body', metatype: UpdateProfileDto }) as Promise<UpdateProfileDto>;

describe('UpdateProfileDto', () => {
  it('trims displayName', async () => {
    await expect(parse({ displayName: '  Maya  ' })).resolves.toMatchObject({
      displayName: 'Maya',
    });
  });

  it('allows leaving fields out', async () => {
    await expect(parse({})).resolves.toEqual({});
  });

  // @IsOptional also skips null, which then reached Prisma (non-nullable
  // columns) and surfaced as a 500.
  it.each([{ displayName: null }, { color: null }])('rejects %j with 422', async (body) => {
    await expect(parse(body)).rejects.toThrow(UnprocessableEntityException);
  });

  it('still accepts null avatarUrl, which clears the avatar', async () => {
    await expect(parse({ avatarUrl: null })).resolves.toEqual({ avatarUrl: null });
  });
});
