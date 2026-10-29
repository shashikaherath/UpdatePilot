import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PREFIX: z.string().default('/api/v1'),
  AGENT_API_PREFIX: z.string().default('/agent/v1'),
  SESSION_SECRET: z.string().min(16).default('updatepilot_dev_session_secret_at_least_32_characters_long'),
  SESSION_COOKIE_NAME: z.string().default('up_session'),
  SESSION_MAX_AGE_MS: z.coerce.number().default(7 * 24 * 60 * 60 * 1000), // 7 days
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173,http://localhost:3001'),
  CSRF_ENABLED: z
    .string()
    .transform((val) => val === 'true')
    .default('false'),
  PAIRING_CODE_EXPIRY_MINUTES: z.coerce.number().default(15),
  UPDATE_PREVIEW_EXPIRY_MINUTES: z.coerce.number().default(15),
  JOB_LEASE_EXPIRY_MINUTES: z.coerce.number().default(5),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export const config = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  allowedOriginsList: parsed.data.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
};
