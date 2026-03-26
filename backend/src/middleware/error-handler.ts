import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function errorHandler(
  error: FastifyError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  // Zod validation errors
  if (error instanceof ZodError) {
    const details = error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    logger.warn('Validation error', { details });
    return reply.status(400).send({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: { errors: details },
    });
  }

  // Application errors
  if (error instanceof AppError) {
    logger.warn(`AppError [${error.code}]: ${error.message}`);
    return reply.status(error.statusCode).send({
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
    });
  }

  // Fastify rate limit errors
  if ('statusCode' in error && error.statusCode === 429) {
    return reply.status(429).send({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    });
  }

  // Fastify JWT errors
  if ('statusCode' in error && error.statusCode === 401) {
    return reply.status(401).send({
      code: 'UNAUTHORIZED',
      message: error.message || 'Authentication required',
    });
  }

  // Unexpected errors - do not expose stack traces
  logger.error('Unhandled error', {
    name: error.name,
    message: error.message,
    stack: error.stack,
  });

  return reply.status(500).send({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}
