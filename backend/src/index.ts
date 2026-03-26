import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth.js';
import { gameRoutes } from './routes/game.js';
import { userRoutes } from './routes/user.js';
import { healthRoutes } from './routes/health.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerSentry, sentryErrorHandler } from './utils/sentry.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { loadPromptTemplates } from './services/prompt-service.js';
import { startAnalyticsFlush, stopAnalyticsFlush } from './services/analytics.js';

async function buildApp() {
  // Load prompt templates into memory at startup
  loadPromptTemplates();
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  // --- Plugins ---
  await app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });

  await app.register(jwt, {
    secret: config.JWT_SECRET,
    sign: {
      expiresIn: '7d',
    },
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    addHeadersOnExceeding: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true },
    addHeaders: { 'x-ratelimit-limit': true, 'x-ratelimit-remaining': true, 'retry-after': true },
  });

  // --- Sentry (error tracking + performance) ---
  await registerSentry(app);

  // --- Error handler ---
  app.setErrorHandler((error: Error, request, reply) => {
    sentryErrorHandler(error, request, reply);
    return errorHandler(error, request, reply);
  });

  // --- API Documentation (Swagger) ---
  try {
    const { registerDocs } = await import('./routes/docs.js');
    await registerDocs(app);
    logger.info('Swagger API docs registered at /api/docs');
  } catch (err) {
    logger.warn('Swagger plugins not available, skipping API docs', { error: err });
  }

  // --- Routes ---
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(gameRoutes, { prefix: '/api/game' });
  await app.register(userRoutes, { prefix: '/api/user' });

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    logger.info(`Server running on port ${config.PORT}`);

    // Start analytics flush timer
    startAnalyticsFlush();
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    await stopAnalyticsFlush();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();

export { buildApp };
