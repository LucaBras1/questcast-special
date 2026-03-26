import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../services/prisma.js';
import { config } from '../utils/config.js';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
}

interface ReadinessResponse extends HealthResponse {
  checks: {
    database: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    redis: { status: 'ok' | 'error' | 'skipped'; latencyMs?: number; error?: string };
    openai: { status: 'ok' | 'error' | 'skipped'; latencyMs?: number; error?: string };
  };
}

/**
 * Health check routes.
 *
 * GET /health       - Basic liveness check (always fast, no external calls)
 * GET /health/ready - Readiness check (verifies DB, Redis, OpenAI connectivity)
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // --- Liveness probe ---
  app.get('/health', async (_request: FastifyRequest, _reply: FastifyReply): Promise<HealthResponse> => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '0.1.0',
      environment: config.NODE_ENV,
    };
  });

  // --- Readiness probe ---
  app.get('/health/ready', async (_request: FastifyRequest, reply: FastifyReply): Promise<ReadinessResponse> => {
    const checks: ReadinessResponse['checks'] = {
      database: { status: 'error' },
      redis: { status: 'skipped' },
      openai: { status: 'skipped' },
    };

    // Check PostgreSQL
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      checks.database = {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown database error',
      };
    }

    // Check Redis
    if (config.REDIS_URL) {
      try {
        const start = Date.now();
        const { Redis } = await import('@upstash/redis');
        const redis = new Redis({ url: config.REDIS_URL, token: '' });
        await redis.ping();
        checks.redis = { status: 'ok', latencyMs: Date.now() - start };
      } catch (err) {
        checks.redis = {
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown Redis error',
        };
      }
    }

    // Check OpenAI API
    if (config.OPENAI_API_KEY) {
      try {
        const start = Date.now();
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
        await openai.models.list({ limit: 1 } as never);
        checks.openai = { status: 'ok', latencyMs: Date.now() - start };
      } catch (err) {
        checks.openai = {
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown OpenAI error',
        };
      }
    }

    // Determine overall status
    const hasErrors = Object.values(checks).some((c) => c.status === 'error');
    const allOk = Object.values(checks).every((c) => c.status === 'ok' || c.status === 'skipped');
    const overallStatus = allOk ? 'ok' : hasErrors ? 'degraded' : 'ok';

    const statusCode = checks.database.status === 'error' ? 503 : 200;

    const response: ReadinessResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? '0.1.0',
      environment: config.NODE_ENV,
      checks,
    };

    return reply.status(statusCode).send(response);
  });
}
