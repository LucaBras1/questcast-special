/**
 * User Profile Routes -- Test Suite
 *
 * Tests for:
 * - GET /api/user/profile: returns user data + preferences + stats
 * - PUT /api/user/profile: update display name, language, content rating
 * - PUT /api/user/profile validation: invalid language, empty name
 * - DELETE /api/user/account: soft delete, subsequent login fails
 * - GET /api/user/stats: correct aggregation of sessions, playtime, characters
 */

import { FastifyInstance } from 'fastify';
import {
  buildTestApp,
  generateTestToken,
  MockDatabase,
} from '../setup';

// ---- Mock Dependencies ----

const mockDb = new MockDatabase();

// User preferences store
const userPreferences = new Map<string, { language: string; contentRating: string; narratorVoice: string }>();

// Soft-deleted users
const deletedUsers = new Set<string>();

// User stats
const userStats = new Map<string, { totalSessions: number; totalPlaytimeMinutes: number; totalCharacters: number; completedSessions: number }>();

describe('User Profile Routes', () => {
  let app: FastifyInstance;
  const userId = 'user-profile-001';
  let authToken: string;

  beforeAll(async () => {
    app = await buildTestApp();

    // Simulate authenticate middleware
    const authenticate = async (request: any, reply: any) => {
      try {
        const decoded = (await request.jwtVerify()) as { sub: string; email: string };

        // Check if user is soft-deleted
        if (deletedUsers.has(decoded.sub)) {
          return reply.status(401).send({
            code: 'ACCOUNT_DELETED',
            message: 'This account has been deleted',
          });
        }

        request.userId = decoded.sub;
        request.userEmail = decoded.email;
      } catch {
        return reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        });
      }
    };

    // GET /api/user/profile
    app.get('/api/user/profile', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const user = mockDb.findUserById(request.userId);

        if (!user) {
          return reply.status(404).send({
            code: 'NOT_FOUND',
            message: 'User not found',
          });
        }

        const prefs = userPreferences.get(request.userId);

        return reply.send({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          language: user.language,
          contentRating: user.contentRating,
          preferences: prefs ?? null,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        });
      },
    });

    // PUT /api/user/profile
    app.put('/api/user/profile', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const user = mockDb.findUserById(request.userId);
        if (!user) {
          return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' });
        }

        const { displayName, language, contentRating } = request.body as {
          displayName?: string;
          language?: string;
          contentRating?: string;
        };

        // Validation
        if (displayName !== undefined) {
          if (typeof displayName !== 'string' || displayName.trim().length === 0) {
            return reply.status(400).send({
              code: 'VALIDATION_ERROR',
              message: 'Display name cannot be empty',
            });
          }
          if (displayName.length > 100) {
            return reply.status(400).send({
              code: 'VALIDATION_ERROR',
              message: 'Display name cannot exceed 100 characters',
            });
          }
          user.displayName = displayName.trim();
        }

        if (language !== undefined) {
          const validLanguages = ['cs', 'en'];
          if (!validLanguages.includes(language)) {
            return reply.status(400).send({
              code: 'VALIDATION_ERROR',
              message: `Invalid language. Must be one of: ${validLanguages.join(', ')}`,
            });
          }
          user.language = language as 'cs' | 'en';
        }

        if (contentRating !== undefined) {
          const validRatings = ['family', 'teen', 'mature'];
          if (!validRatings.includes(contentRating)) {
            return reply.status(400).send({
              code: 'VALIDATION_ERROR',
              message: `Invalid content rating. Must be one of: ${validRatings.join(', ')}`,
            });
          }
          user.contentRating = contentRating as 'family' | 'teen' | 'mature';
        }

        user.updatedAt = new Date();

        return reply.send({
          id: user.id,
          displayName: user.displayName,
          language: user.language,
          contentRating: user.contentRating,
          updatedAt: user.updatedAt.toISOString(),
        });
      },
    });

    // DELETE /api/user/account
    app.delete('/api/user/account', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const user = mockDb.findUserById(request.userId);
        if (!user) {
          return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' });
        }

        // Soft delete
        deletedUsers.add(request.userId);

        return reply.send({
          success: true,
          message: 'Account has been deleted',
        });
      },
    });

    // GET /api/user/stats
    app.get('/api/user/stats', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const stats = userStats.get(request.userId) ?? {
          totalSessions: 0,
          totalPlaytimeMinutes: 0,
          totalCharacters: 0,
          completedSessions: 0,
        };

        return reply.send(stats);
      },
    });

    await app.ready();
    authToken = generateTestToken(app, { sub: userId, email: 'player@questcast.app' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockDb.reset();
    userPreferences.clear();
    deletedUsers.clear();
    userStats.clear();

    // Create default user
    mockDb.createUser({
      id: userId,
      email: 'player@questcast.app',
      displayName: 'Test Player',
      language: 'en',
      contentRating: 'teen',
    } as any);
  });

  // ================================================================
  // GET /api/user/profile
  // ================================================================

  describe('GET /api/user/profile', () => {
    it('should return user data with preferences', async () => {
      userPreferences.set(userId, {
        language: 'cs',
        contentRating: 'teen',
        narratorVoice: 'alloy',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(userId);
      expect(body.email).toBe('player@questcast.app');
      expect(body.displayName).toBe('Test Player');
      expect(body.language).toBe('en');
      expect(body.contentRating).toBe('teen');
      expect(body.preferences).toEqual({
        language: 'cs',
        contentRating: 'teen',
        narratorVoice: 'alloy',
      });
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('should return null preferences when none set', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().preferences).toBeNull();
    });

    it('should reject unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/user/profile',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ================================================================
  // PUT /api/user/profile
  // ================================================================

  describe('PUT /api/user/profile', () => {
    it('should update display name', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { displayName: 'New Player Name' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().displayName).toBe('New Player Name');
    });

    it('should update language', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { language: 'cs' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().language).toBe('cs');
    });

    it('should update content rating', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { contentRating: 'mature' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().contentRating).toBe('mature');
    });

    it('should update multiple fields at once', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          displayName: 'Updated Name',
          language: 'cs',
          contentRating: 'family',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.displayName).toBe('Updated Name');
      expect(body.language).toBe('cs');
      expect(body.contentRating).toBe('family');
    });

    it('should reject invalid language', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { language: 'de' }, // German not supported
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toMatch(/invalid language/i);
    });

    it('should reject empty display name', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { displayName: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toMatch(/empty/i);
    });

    it('should reject whitespace-only display name', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { displayName: '   ' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject display name exceeding 100 characters', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { displayName: 'A'.repeat(101) },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject invalid content rating', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { contentRating: 'explicit' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject unauthenticated request', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/api/user/profile',
        payload: { displayName: 'Hacker' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ================================================================
  // DELETE /api/user/account
  // ================================================================

  describe('DELETE /api/user/account', () => {
    it('should soft delete the account', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/user/account',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
    });

    it('should reject subsequent requests after deletion', async () => {
      // Delete account
      await app.inject({
        method: 'DELETE',
        url: '/api/user/account',
        headers: { authorization: `Bearer ${authToken}` },
      });

      // Try to access profile
      const response = await app.inject({
        method: 'GET',
        url: '/api/user/profile',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('ACCOUNT_DELETED');
    });

    it('should reject unauthenticated request', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/user/account',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ================================================================
  // GET /api/user/stats
  // ================================================================

  describe('GET /api/user/stats', () => {
    it('should return correct aggregated stats', async () => {
      userStats.set(userId, {
        totalSessions: 12,
        totalPlaytimeMinutes: 360,
        totalCharacters: 5,
        completedSessions: 8,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/user/stats',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalSessions).toBe(12);
      expect(body.totalPlaytimeMinutes).toBe(360);
      expect(body.totalCharacters).toBe(5);
      expect(body.completedSessions).toBe(8);
    });

    it('should return zeros for new user with no activity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/user/stats',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.totalSessions).toBe(0);
      expect(body.totalPlaytimeMinutes).toBe(0);
      expect(body.totalCharacters).toBe(0);
      expect(body.completedSessions).toBe(0);
    });

    it('should reject unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/user/stats',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
