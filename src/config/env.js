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
  CLOUDINARY_CLOUD_NAME: z.string().trim().optional(),
  CLOUDINARY_API_KEY: z.string().trim().optional(),
  CLOUDINARY_API_SECRET: z.string().trim().optional(),
  PAYSTACK_SECRET_KEY: z.string().trim().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().trim().optional(),
  TURN_URL: z.string().trim().optional(),
  TURN_USERNAME: z.string().trim().optional(),
  TURN_CREDENTIAL: z.string().trim().optional(),
  FRONTEND_URL: z.string().trim().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
const e = parsed.data;
const cloudinaryValues = [e.CLOUDINARY_CLOUD_NAME, e.CLOUDINARY_API_KEY, e.CLOUDINARY_API_SECRET];
if (cloudinaryValues.some(Boolean) && !cloudinaryValues.every(Boolean)) {
  console.error('Invalid environment variables: set all three CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET values.');
  process.exit(1);
}

export const env = {
  nodeEnv: e.NODE_ENV,
  isProd: e.NODE_ENV === 'production',
  isTest: e.NODE_ENV === 'test',
  port: e.PORT,
  databaseUrl: e.DATABASE_URL,
  jwtAccessSecret: e.JWT_ACCESS_SECRET,
  accessTtlMinutes: e.ACCESS_TOKEN_TTL_MINUTES,
  refreshTtlDays: e.REFRESH_TOKEN_TTL_DAYS,
  cloudinary: cloudinaryValues.every(Boolean) ? {
    cloudName: e.CLOUDINARY_CLOUD_NAME,
    apiKey: e.CLOUDINARY_API_KEY,
    apiSecret: e.CLOUDINARY_API_SECRET,
  } : null,
  paystack: e.PAYSTACK_SECRET_KEY && e.PAYSTACK_PUBLIC_KEY ? {
    secretKey: e.PAYSTACK_SECRET_KEY,
    publicKey: e.PAYSTACK_PUBLIC_KEY,
  } : null,
  turn: e.TURN_URL ? {
    urls: e.TURN_URL,
    username: e.TURN_USERNAME,
    credential: e.TURN_CREDENTIAL,
  } : null,
  frontendUrl: e.FRONTEND_URL,
  corsOrigins: e.CORS_ORIGIN ? e.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean) : [],
};
