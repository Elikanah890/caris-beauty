import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default('8h'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true')
});

export const env = schema.parse(process.env);

export const isTest = env.NODE_ENV === 'test';
export const databaseUrl = isTest
  ? env.TEST_DATABASE_URL ?? env.DATABASE_URL
  : env.DATABASE_URL;
