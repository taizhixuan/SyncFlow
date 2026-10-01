import { DEV_ACCESS_SECRET } from './env.validation';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

/**
 * Typed view of the (already-validated) environment. Access only via
 * ConfigService — never read process.env elsewhere (CLAUDE.md §5 backend).
 *
 * ConfigModule writes Joi defaults back into process.env before this factory
 * runs, so the fallbacks below only matter when the module is bypassed.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  webOrigins: string[];
  redisUrl: string;
  trustProxy: number;
  swaggerEnabled: boolean;
  throttleStorage: 'redis' | 'memory';
  logLevel: LogLevel;
  /** Days a soft-deleted board is kept before BoardPurgeService hard-deletes it. */
  boardPurgeAfterDays: number;
  s3: {
    endpoint?: string;
    region: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle: boolean;
  };
  jwt: {
    accessSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
}

/**
 * Env files ConfigModule reads as a fallback for unset variables. Tests get
 * none: they run on exactly what `.env.test`/CI provides, so a value that only
 * the developer's own `.env` supplies can't make a test pass locally and fail
 * in CI.
 */
export function envFilePaths(): string[] {
  return process.env.NODE_ENV === 'test' ? [] : ['../../.env', '.env'];
}

export const configuration = (): AppConfig => {
  const nodeEnv = (process.env.NODE_ENV as AppConfig['nodeEnv'] | undefined) ?? 'development';
  const isProd = nodeEnv === 'production';
  return {
    nodeEnv,
    port: parseInt(process.env.API_PORT ?? '3000', 10),
    webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    redisUrl: process.env.REDIS_URL ?? '',
    trustProxy: parseInt(process.env.TRUST_PROXY ?? (isProd ? '1' : '0'), 10),
    swaggerEnabled: (process.env.SWAGGER_ENABLED ?? String(!isProd)) === 'true',
    throttleStorage: process.env.THROTTLE_STORAGE === 'memory' ? 'memory' : 'redis',
    logLevel: (process.env.LOG_LEVEL as LogLevel | undefined) ?? (isProd ? 'info' : 'debug'),
    boardPurgeAfterDays: parseInt(process.env.BOARD_PURGE_AFTER_DAYS ?? '30', 10),
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      bucket: process.env.S3_BUCKET,
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? DEV_ACCESS_SECRET,
      accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
      refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '1209600', 10),
    },
  };
};
