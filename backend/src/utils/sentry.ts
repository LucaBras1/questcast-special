import * as Sentry from '@sentry/node';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from './config.js';

/**
 * Initialize Sentry for the Fastify backend.
 * Call this once at application startup, before registering routes.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.warn('[Sentry] SENTRY_DSN not set -- error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: config.NODE_ENV,
    release: `questcast-backend@${process.env.npm_package_version ?? '0.1.0'}`,

    // Performance monitoring
    tracesSampleRate: config.NODE_ENV === 'production' ? 0.2 : 1.0,

    // Only send errors in staging/production
    enabled: config.NODE_ENV !== 'development',

    integrations: [
      Sentry.httpIntegration(),
    ],

    // Filter out health check noise
    beforeSend(event) {
      const url = event.request?.url;
      if (url && url.includes('/health')) {
        return null;
      }
      return event;
    },
  });

  console.info('[Sentry] Initialized for environment:', config.NODE_ENV);
}

/**
 * Fastify plugin that captures unhandled errors and sends them to Sentry.
 * Register this as an error handler on the Fastify instance.
 */
export function sentryErrorHandler(
  error: Error,
  request: FastifyRequest,
  _reply: FastifyReply,
): void {
  Sentry.withScope((scope) => {
    scope.setTag('method', request.method);
    scope.setTag('url', request.url);
    scope.setExtra('params', request.params);
    scope.setExtra('query', request.query);

    if (request.user) {
      scope.setUser({ id: String((request.user as Record<string, unknown>).id) });
    }

    Sentry.captureException(error);
  });
}

/**
 * Fastify hook to add Sentry request tracing.
 * Register with: app.addHook('onRequest', sentryRequestHook)
 */
export async function sentryRequestHook(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  Sentry.withScope((scope) => {
    scope.setTag('route', request.routeOptions?.url ?? request.url);
    scope.setTag('method', request.method);
  });
}

/**
 * Register all Sentry integrations with a Fastify instance.
 */
export async function registerSentry(app: FastifyInstance): Promise<void> {
  initSentry();

  // Add request tracing hook
  app.addHook('onRequest', sentryRequestHook);

  // Flush Sentry events on shutdown
  app.addHook('onClose', async () => {
    await Sentry.flush(2000);
  });
}
