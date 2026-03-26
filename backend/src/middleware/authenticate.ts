import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../utils/errors.js';

/**
 * JWT authentication middleware.
 * Decodes the JWT from Authorization header and attaches user info to request.
 */

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<{ sub: string; email: string }>();
    request.userId = decoded.sub;
    request.userEmail = decoded.email;
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}
