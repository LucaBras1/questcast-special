import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createSessionSchema,
  sessionIdParamSchema,
  updateSessionStatusSchema,
} from '../models/schemas.js';
import {
  createSession,
  getSession,
  listSessions,
  updateSessionStatus,
  manualSave,
} from '../services/game-service.js';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import type { CreateSessionInput, UpdateSessionStatusInput } from '../models/schemas.js';
import { z } from 'zod';
import { turnRoutes } from './turn.js';
import { diceRoutes } from './dice.js';
import { imageRoutes } from './image.js';

const listSessionsQuerySchema = z.object({
  status: z.enum(['active', 'paused', 'completed']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

export async function gameRoutes(app: FastifyInstance) {
  // All game routes require authentication
  app.addHook('preHandler', authenticate);

  // Register turn routes (SSE streaming endpoint)
  await app.register(turnRoutes);

  // Register dice routes
  await app.register(diceRoutes);

  // Register image routes
  await app.register(imageRoutes);

  /**
   * POST /api/game/session
   * Create a new game session with a new character.
   */
  app.post(
    '/session',
    {
      preHandler: [validateBody(createSessionSchema)],
    },
    async (request: FastifyRequest<{ Body: CreateSessionInput }>, reply: FastifyReply) => {
      const session = await createSession(request.userId, request.body);
      return reply.status(201).send(session);
    },
  );

  /**
   * GET /api/game/session/:id
   * Get a specific game session by ID. User must own the session.
   */
  app.get(
    '/session/:id',
    {
      preHandler: [validateParams(sessionIdParamSchema)],
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const session = await getSession(request.params.id, request.userId);
      return reply.send(session);
    },
  );

  /**
   * GET /api/game/sessions
   * List all sessions for the authenticated user.
   * Supports filtering by status and pagination (limit/offset).
   */
  app.get(
    '/sessions',
    async (request: FastifyRequest<{ Querystring: ListSessionsQuery }>, reply: FastifyReply) => {
      const query = listSessionsQuerySchema.parse(request.query);
      const result = await listSessions(request.userId, {
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      });
      return reply.send(result);
    },
  );

  /**
   * PATCH /api/game/session/:id/status
   * Update session status (active/paused/completed).
   */
  app.patch(
    '/session/:id/status',
    {
      preHandler: [
        validateParams(sessionIdParamSchema),
        validateBody(updateSessionStatusSchema),
      ],
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: UpdateSessionStatusInput;
      }>,
      reply: FastifyReply,
    ) => {
      const result = await updateSessionStatus(request.params.id, request.userId, request.body.status);
      return reply.send({
        success: true,
        status: request.body.status,
        ...(result.recap && { recap: result.recap }),
      });
    },
  );

  /**
   * POST /api/game/session/:id/save
   * Manually save the current session state to PostgreSQL.
   */
  app.post(
    '/session/:id/save',
    {
      preHandler: [validateParams(sessionIdParamSchema)],
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      await manualSave(request.params.id, request.userId);
      return reply.send({ success: true, message: 'Session saved successfully' });
    },
  );
}
