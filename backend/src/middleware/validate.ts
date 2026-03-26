import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodSchema } from 'zod';
import { sanitizeObject } from '../utils/sanitize.js';

/**
 * Creates a Fastify preHandler that validates request body against a Zod schema.
 * Sanitizes string fields before validation to strip HTML/control characters.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    // Sanitize string fields before Zod validation
    if (request.body && typeof request.body === 'object') {
      request.body = sanitizeObject(request.body as Record<string, unknown>);
    }
    request.body = schema.parse(request.body);
  };
}

/**
 * Creates a Fastify preHandler that validates query parameters against a Zod schema.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    request.query = schema.parse(request.query) as typeof request.query;
  };
}

/**
 * Creates a Fastify preHandler that validates route params against a Zod schema.
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    request.params = schema.parse(request.params) as typeof request.params;
  };
}
