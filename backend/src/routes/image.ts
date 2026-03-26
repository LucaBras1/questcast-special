import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { validateParams, validateBody } from '../middleware/validate.js';
import { sessionIdParamSchema } from '../models/schemas.js';
import { getSession } from '../services/game-service.js';
import { generateSceneImage, ImageLimitError } from '../services/image-service.js';
import { logger } from '../utils/logger.js';
import { CircuitBreakerOpenError } from '../utils/circuit-breaker.js';

// ---- Request Schema ----

const imageRequestSchema = z.object({
  sceneDescription: z.string().min(10, 'Scene description must be at least 10 characters').max(500),
  artStyle: z.enum(['epic_fantasy', 'dark_atmospheric', 'storybook', 'painterly']),
});

type ImageRequestBody = z.infer<typeof imageRequestSchema>;

// ---- Routes ----

export async function imageRoutes(app: FastifyInstance) {
  // All image routes require authentication
  app.addHook('preHandler', authenticate);

  /**
   * POST /api/game/session/:id/image
   *
   * Generate a scene image for the current game session.
   * - Checks session ownership and status
   * - Enforces max images per session (2 for free tier)
   * - Uses Redis cache (7-day TTL) to avoid regenerating identical scenes
   * - Returns the image URL, prompt used, and whether it was cached
   */
  app.post(
    '/session/:id/image',
    {
      schema: {
        tags: ['Image'],
        summary: 'Generate an AI scene image for the current session',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['sceneDescription', 'artStyle'],
          properties: {
            sceneDescription: { type: 'string', minLength: 10, maxLength: 500 },
            artStyle: { type: 'string', enum: ['epic_fantasy', 'dark_atmospheric', 'storybook', 'painterly'] },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              imageUrl: { type: 'string' },
              prompt: { type: 'string' },
              cached: { type: 'boolean' },
            },
          },
        },
      },
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 minute',
          keyGenerator: (request: FastifyRequest) => {
            const params = request.params as { id: string };
            return `image:${params.id}`;
          },
        },
      },
      preHandler: [
        validateParams(sessionIdParamSchema),
        validateBody(imageRequestSchema),
      ],
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: ImageRequestBody }>,
      reply: FastifyReply,
    ) => {
      const sessionId = request.params.id;
      const { sceneDescription, artStyle } = request.body;

      // Verify session ownership and status
      const session = await getSession(sessionId, request.userId);
      if (session.status !== 'active') {
        return reply.status(400).send({
          code: 'SESSION_NOT_ACTIVE',
          message: `Session is ${session.status}. Cannot generate images.`,
        });
      }

      try {
        const result = await generateSceneImage(
          sessionId,
          request.userId,
          sceneDescription,
          artStyle,
        );

        return reply.send({
          imageUrl: result.imageUrl,
          prompt: result.prompt,
          cached: result.cached,
        });
      } catch (error) {
        if (error instanceof ImageLimitError) {
          return reply.status(429).send({
            code: 'IMAGE_LIMIT_REACHED',
            message: error.message,
            details: {
              currentCount: error.currentCount,
              maxImages: 2,
            },
          });
        }

        if (error instanceof CircuitBreakerOpenError) {
          return reply.status(503).send({
            code: 'IMAGE_SERVICE_UNAVAILABLE',
            message: 'Image generation service is temporarily unavailable. Please try again later.',
            details: {
              retryAfterMs: error.retryAfterMs,
            },
          });
        }

        logger.error('Image generation failed', { sessionId, error });
        return reply.status(502).send({
          code: 'IMAGE_GENERATION_FAILED',
          message: 'Failed to generate image. Please try again.',
        });
      }
    },
  );
}
