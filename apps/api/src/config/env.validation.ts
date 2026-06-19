import * as Joi from 'joi';

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

  // Auth — used from the auth phase onward.
  JWT_ACCESS_SECRET: Joi.string().min(8).default('dev_access_secret_change_me'),
  JWT_REFRESH_SECRET: Joi.string().min(8).default('dev_refresh_secret_change_me'),
  JWT_ACCESS_TTL: Joi.number().default(900),
  JWT_REFRESH_TTL: Joi.number().default(1209600),
}).unknown(true);
