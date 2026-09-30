import * as Joi from 'joi';

/** Published in `.env.example`; anyone can read it, so it must never sign prod tokens. */
export const DEV_ACCESS_SECRET = 'dev_access_secret_change_me';

const isProduction = { is: 'production' } as const;

/**
 * Boot-time environment validation. ConfigModule rejects startup if any
 * required variable is missing or malformed — fail fast, never run misconfigured.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  API_PORT: Joi.number().port().default(3000),
  WEB_ORIGIN: Joi.string().required(),

  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),

  // Object storage — used from the canvas-image phase onward.
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_BUCKET: Joi.string().optional(),
  S3_ACCESS_KEY: Joi.string().optional(),
  S3_SECRET_KEY: Joi.string().optional(),
  S3_FORCE_PATH_STYLE: Joi.boolean().truthy('true').falsy('false').default(true),

  // A blank/missing secret in production used to boot with the public dev
  // default, letting anyone forge access tokens. Production now demands a real
  // one; dev/test keep the convenience default. Refresh tokens are opaque random
  // values (hashed in Postgres), so there is no refresh signing secret.
  JWT_ACCESS_SECRET: Joi.when('NODE_ENV', {
    ...isProduction,
    then: Joi.string().min(32).invalid(DEV_ACCESS_SECRET).required(),
    otherwise: Joi.string().min(8).default(DEV_ACCESS_SECRET),
  }),
  JWT_ACCESS_TTL: Joi.number().integer().min(1).default(900),
  JWT_REFRESH_TTL: Joi.number().integer().min(1).default(1209600),

  // Express `trust proxy` hop count. Render terminates TLS in front of the app,
  // so without one trusted hop every client shares the proxy's IP and a single
  // abuser exhausts the rate limit for everyone.
  TRUST_PROXY: Joi.number()
    .integer()
    .min(0)
    .when('NODE_ENV', { ...isProduction, then: Joi.number().default(1), otherwise: Joi.number().default(0) }),

  // Swagger UI advertises the whole attack surface; off in prod unless asked for.
  SWAGGER_ENABLED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .when('NODE_ENV', { ...isProduction, then: Joi.boolean().default(false), otherwise: Joi.boolean().default(true) }),

  // Redis storage shares rate-limit counters across instances. e2e suites use
  // memory so parallel runs don't trip each other's buckets on 127.0.0.1.
  THROTTLE_STORAGE: Joi.string()
    .valid('redis', 'memory')
    .when('NODE_ENV', { is: 'test', then: Joi.string().default('memory'), otherwise: Joi.string().default('redis') }),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .when('NODE_ENV', {
      switch: [
        { is: 'production', then: Joi.string().default('info') },
        { is: 'test', then: Joi.string().default('error') },
      ],
      otherwise: Joi.string().default('debug'),
    }),
}).unknown(true);
