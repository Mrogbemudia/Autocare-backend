import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  CORS_ORIGIN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const e = parsed.data;

export const env = {
  nodeEnv: e.NODE_ENV,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  port: e.PORT,
  databaseUrl: e.DATABASE_URL,
  jwtAccessSecret: e.JWT_ACCESS_SECRET,
  accessTtlMinutes: e.ACCESS_TOKEN_TTL_MINUTES,
  refreshTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
  corsOrigins: e.CORS_ORIGIN ? e.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean) : [],
};
