import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { validateBody } from '../middleware/validate.js';
import { prisma } from '../services/prisma.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// ---- Schemas ----

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  language: z.enum(['cs', 'en']).optional(),
  contentRating: z.enum(['family', 'teen', 'mature']).optional(),
});

type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export async function userRoutes(app: FastifyInstance) {
  // All user routes require authentication
  app.addHook('preHandler', authenticate);

  /**
   * GET /api/user/profile
   * Get the authenticated user's profile, preferences, and session stats.
   */
  app.get('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.userId },
      include: {
        preferences: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User', request.userId);
    }

    // Get session count for quick stats
    const sessionCount = await prisma.gameSession.count({
      where: { userId: request.userId },
    });

    return reply.send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      language: user.language,
      contentRating: user.contentRating,
      preferences: user.preferences
        ? {
            language: user.preferences.language,
            contentRating: user.preferences.contentRating,
            narratorVoice: user.preferences.narratorVoice,
          }
        : null,
      sessionCount,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  });

  /**
   * PUT /api/user/profile
   * Update the authenticated user's display name, language, or content rating.
   */
  app.put(
    '/profile',
    {
      preHandler: [validateBody(updateProfileSchema)],
    },
    async (request: FastifyRequest<{ Body: UpdateProfileInput }>, reply: FastifyReply) => {
      const { displayName, language, contentRating } = request.body;

      // Build update data, only including provided fields
      const updateData: Record<string, unknown> = {};
      if (displayName !== undefined) updateData.displayName = displayName;
      if (language !== undefined) updateData.language = language;
      if (contentRating !== undefined) updateData.contentRating = contentRating;

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({
          code: 'VALIDATION_ERROR',
          message: 'At least one field must be provided for update',
        });
      }

      const user = await prisma.user.update({
        where: { id: request.userId },
        data: updateData,
      });

      // Also update preferences if they exist
      if (language !== undefined || contentRating !== undefined) {
        const prefsUpdate: Record<string, unknown> = {};
        if (language !== undefined) prefsUpdate.language = language;
        if (contentRating !== undefined) prefsUpdate.contentRating = contentRating;

        await prisma.userPreferences.upsert({
          where: { userId: request.userId },
          update: prefsUpdate,
          create: {
            userId: request.userId,
            language: language ?? 'en',
            contentRating: contentRating ?? 'teen',
          },
        });
      }

      logger.info('User profile updated', { userId: request.userId, fields: Object.keys(updateData) });

      return reply.send({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        language: user.language,
        contentRating: user.contentRating,
        updatedAt: user.updatedAt.toISOString(),
      });
    },
  );

  /**
   * DELETE /api/user/account
   * Soft-delete the user account.
   * Marks the user as inactive by appending '_deleted_<timestamp>' to email.
   * Actual data deletion is scheduled for later (GDPR compliance).
   */
  app.delete('/account', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    // Soft delete: invalidate email to prevent login, but keep data for grace period
    const deletionTimestamp = Date.now();
    await prisma.user.update({
      where: { id: userId },
      data: {
        email: `${user.email}_deleted_${deletionTimestamp}`,
        displayName: 'Deleted User',
      },
    });

    // Mark all active sessions as completed
    await prisma.gameSession.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'completed' },
    });

    logger.info('User account soft-deleted', {
      userId,
      scheduledDeletion: new Date(deletionTimestamp + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    });

    return reply.send({
      success: true,
      message: 'Account marked for deletion. Data will be permanently removed within 30 days.',
    });
  });

  /**
   * GET /api/user/stats
   * Get aggregated stats for the authenticated user.
   */
  app.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.userId;

    // Get session stats
    const [totalSessions, completedSessions, activeSessions] = await Promise.all([
      prisma.gameSession.count({ where: { userId } }),
      prisma.gameSession.count({ where: { userId, status: 'completed' } }),
      prisma.gameSession.count({ where: { userId, status: 'active' } }),
    ]);

    // Get character count
    const totalCharacters = await prisma.character.count({ where: { userId } });

    // Get total turns and playtime from game events
    const turnStats = await prisma.gameEvent.aggregate({
      where: {
        session: { userId },
      },
      _count: { id: true },
    });

    // Estimate total playtime from sessions' game state
    const sessions = await prisma.gameSession.findMany({
      where: { userId },
      select: { gameState: true },
    });

    let totalPlaytimeMinutes = 0;
    let totalTurnsFromState = 0;
    for (const session of sessions) {
      const gs = session.gameState as Record<string, unknown> | null;
      if (gs && typeof gs === 'object') {
        const sessionData = (gs as { session?: { timeElapsedMinutes?: number; turnsPlayed?: number } }).session;
        if (sessionData?.timeElapsedMinutes) {
          totalPlaytimeMinutes += sessionData.timeElapsedMinutes;
        }
        if (sessionData?.turnsPlayed) {
          totalTurnsFromState += sessionData.turnsPlayed;
        }
      }
    }

    return reply.send({
      totalSessions,
      completedSessions,
      activeSessions,
      totalCharacters,
      totalTurns: totalTurnsFromState || turnStats._count.id,
      totalPlaytimeMinutes: Math.round(totalPlaytimeMinutes),
      totalPlaytimeHours: Math.round(totalPlaytimeMinutes / 60 * 10) / 10,
    });
  });
}
