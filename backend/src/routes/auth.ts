import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { registerSchema, loginSchema, refreshTokenSchema } from '../models/schemas.js';
import { registerUser, loginUser, refreshAccessToken } from '../services/auth-service.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import { prisma } from '../services/prisma.js';
import { logger } from '../utils/logger.js';
import type { RegisterInput, LoginInput, RefreshTokenInput } from '../models/schemas.js';

const authProfileUpdateSchema = z.object({
  language: z.enum(['cs', 'en']).optional(),
  contentRating: z.enum(['family', 'teen', 'mature']).optional(),
});

type AuthProfileUpdateInput = z.infer<typeof authProfileUpdateSchema>;

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /api/auth/register
   * Register a new user account.
   */
  app.post(
    '/register',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Register a new user account',
        body: {
          type: 'object',
          required: ['email', 'password', 'displayName'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8, maxLength: 128 },
            displayName: { type: 'string', minLength: 1, maxLength: 100 },
            language: { type: 'string', enum: ['cs', 'en'], default: 'en' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              user: { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, displayName: { type: 'string' } } },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              expiresAt: { type: 'number' },
            },
          },
        },
      },
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
      schema: {
        tags: ['Auth'],
        summary: 'Login with email and password',
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              user: { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, displayName: { type: 'string' } } },
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              expiresAt: { type: 'number' },
            },
          },
        },
      },
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

  /**
   * PATCH /api/auth/profile
   * Update language and content rating preferences.
   * Lightweight endpoint for mobile settings sync.
   */
  app.patch<{ Body: AuthProfileUpdateInput }>(
    '/profile',
    {
      preHandler: [authenticate, validateBody(authProfileUpdateSchema)],
    },
    async (request, reply) => {
      const { language, contentRating } = request.body;

      const updateData: Record<string, unknown> = {};
      if (language !== undefined) updateData.language = language;
      if (contentRating !== undefined) updateData.contentRating = contentRating;

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'At least one field (language or contentRating) must be provided',
        });
      }

      // Update user record
      await prisma.user.update({
        where: { id: request.userId },
        data: updateData,
      });

      // Sync preferences table
      await prisma.userPreferences.upsert({
        where: { userId: request.userId },
        update: updateData,
        create: {
          userId: request.userId,
          language: language ?? 'en',
          contentRating: contentRating ?? 'teen',
        },
      });

      logger.info('Auth profile updated', { userId: request.userId, fields: Object.keys(updateData) });

      return reply.send({
        success: true,
        language: language ?? undefined,
        contentRating: contentRating ?? undefined,
      });
    },
  );
}
