import { envValidationSchema } from './env.validation';

const BASE = {
  WEB_ORIGIN: 'https://syncflows.xyz',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};
const STRONG = 'a'.repeat(32);

function validate(env: Record<string, string>): { error?: Error; value: Record<string, unknown> } {
  const { error, value } = envValidationSchema.validate({ ...BASE, ...env }, { abortEarly: false });
  return { error, value: value as Record<string, unknown> };
}

describe('envValidationSchema — JWT secrets', () => {
  it('rejects a production boot with no access secret (would fall back to a public default)', () => {
    expect(validate({ NODE_ENV: 'production' }).error).toBeDefined();
  });

  it('rejects the published dev default in production', () => {
    const { error } = validate({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'dev_access_secret_change_me',
    });
    expect(error).toBeDefined();
  });

  it('rejects a short secret in production', () => {
    expect(validate({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'short-but-8+' }).error).toBeDefined();
  });

  it('accepts a strong secret in production', () => {
    expect(validate({ NODE_ENV: 'production', JWT_ACCESS_SECRET: STRONG }).error).toBeUndefined();
  });

  it('keeps the dev default outside production', () => {
    const { error, value } = validate({ NODE_ENV: 'development' });
    expect(error).toBeUndefined();
    expect(value.JWT_ACCESS_SECRET).toBe('dev_access_secret_change_me');
  });

  it('no longer requires JWT_REFRESH_SECRET (refresh tokens are opaque)', () => {
    const { value } = validate({ NODE_ENV: 'development' });
    expect(value.JWT_REFRESH_SECRET).toBeUndefined();
  });

  it('rejects non-integer and non-positive TTLs', () => {
    expect(validate({ JWT_ACCESS_TTL: '1.5' }).error).toBeDefined();
    expect(validate({ JWT_REFRESH_TTL: '0' }).error).toBeDefined();
  });
});

describe('envValidationSchema — operational defaults', () => {
  it('trusts one proxy hop in production and none elsewhere', () => {
    expect(validate({ NODE_ENV: 'production', JWT_ACCESS_SECRET: STRONG }).value.TRUST_PROXY).toBe(1);
    expect(validate({ NODE_ENV: 'development' }).value.TRUST_PROXY).toBe(0);
  });

  it('disables Swagger UI in production unless explicitly enabled', () => {
    expect(validate({ NODE_ENV: 'production', JWT_ACCESS_SECRET: STRONG }).value.SWAGGER_ENABLED).toBe(false);
    expect(validate({ NODE_ENV: 'development' }).value.SWAGGER_ENABLED).toBe(true);
  });

  it('uses shared Redis throttle storage except under test', () => {
    expect(validate({ NODE_ENV: 'production', JWT_ACCESS_SECRET: STRONG }).value.THROTTLE_STORAGE).toBe('redis');
    expect(validate({ NODE_ENV: 'test' }).value.THROTTLE_STORAGE).toBe('memory');
  });
});

describe('envValidationSchema — board purge retention', () => {
  it('keeps soft-deleted boards for 30 days by default', () => {
    expect(validate({}).value.BOARD_PURGE_AFTER_DAYS).toBe(30);
  });

  it('accepts a custom whole number of days', () => {
    const { error, value } = validate({ BOARD_PURGE_AFTER_DAYS: '7' });
    expect(error).toBeUndefined();
    expect(value.BOARD_PURGE_AFTER_DAYS).toBe(7);
  });

  it('rejects zero, negative and fractional retention (no grace window for accidental deletes)', () => {
    expect(validate({ BOARD_PURGE_AFTER_DAYS: '0' }).error).toBeDefined();
    expect(validate({ BOARD_PURGE_AFTER_DAYS: '-3' }).error).toBeDefined();
    expect(validate({ BOARD_PURGE_AFTER_DAYS: '1.5' }).error).toBeDefined();
  });
});

describe('envValidationSchema — WEB_ORIGIN', () => {
  it.each([
    'https://syncflows.xyz',
    'https://syncflows.xyz/',
    'https://syncflows.xyz, https://www.syncflows.xyz/app',
    'http://localhost:5173',
  ])('accepts %s (paths and trailing slashes are normalised away later)', (origins) => {
    expect(validate({ WEB_ORIGIN: origins }).error).toBeUndefined();
  });

  it.each(['syncflows.xyz', 'https://ok.example,not a url', 'ftp://files.example', 'null', ' , '])(
    'rejects %j, which could never match a browser Origin',
    (origins) => {
      expect(validate({ WEB_ORIGIN: origins }).error).toBeDefined();
    },
  );
});
