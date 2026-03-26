import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional().default(''),
  REDIS_TOKEN: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_ANON_KEY: z.string().optional().default(''),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().optional().default('*'),
  SENTRY_DSN: z.string().optional().default(''),
  DAILY_AI_COST_ALERT_THRESHOLD: z.coerce.number().optional().default(50),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    console.error('Invalid environment configuration:\n' + missing.join('\n'));
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
