import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { registerSchema, loginSchema, refreshTokenSchema } from '../models/schemas.js';
import { registerUser, loginUser, refreshAccessToken } from '../services/auth-service.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import type { RegisterInput, LoginInput, RefreshTokenInput } from '../models/schemas.js';

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/register
   * Register a new user account.
   */
  app.post(
    '/register',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (request: FastifyRequest) => `auth:${request.ip}`,
        },
      },
      preHandler: [validateBody(registerSchema)],
    },
    async (request: FastifyRequest<{ Body: RegisterInput }>, reply: FastifyReply) => {
      const result = await registerUser(request.body, (payload) =>
        app.jwt.sign(payload, { expiresIn: '7d' }),
      );

      return reply.status(201).send({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
    },
  );

  /**
   * POST /api/auth/login
   * Authenticate with email and password. Returns JWT tokens.
   */
  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (request: FastifyRequest) => `auth:${request.ip}`,
        },
      },
      preHandler: [validateBody(loginSchema)],
    },
    async (request: FastifyRequest<{ Body: LoginInput }>, reply: FastifyReply) => {
      const result = await loginUser(request.body, (payload) =>
        app.jwt.sign(payload, { expiresIn: '7d' }),
      );

      return reply.send({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
    },
  );

  /**
   * POST /api/auth/refresh
   * Refresh the access token using a refresh token.
   * Requires existing valid JWT in Authorization header.
   */
  app.post<{ Body: RefreshTokenInput }>(
    '/refresh',
    {
      preHandler: [authenticate, validateBody(refreshTokenSchema)],
    },
    async (request, reply) => {
      const result = await refreshAccessToken(request.userId, (payload) =>
        app.jwt.sign(payload, { expiresIn: '7d' }),
      );

      return reply.send({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
    },
  );
}
