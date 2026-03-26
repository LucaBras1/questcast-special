import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodSchema } from 'zod';

/**
 * Creates a Fastify preHandler that validates request body against a Zod schema.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
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
