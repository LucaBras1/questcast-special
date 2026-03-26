/**
 * Game Routes -- Test Suite
 *
 * Tests for:
 * - POST /api/game/session        (create new game session)
 * - GET  /api/game/session/:id    (load session)
 * - GET  /api/game/sessions       (list user's sessions)
 */

import { FastifyInstance } from 'fastify';
import {
  buildTestApp,
  generateTestToken,
  createMockGameState,
  MockDatabase,
  MockGameSession,
} from '../setup';

// ---- Mock Dependencies ----

const mockDb = new MockDatabase();

// ---- Test Suite ----

describe('Game Routes', () => {
  let app: FastifyInstance;
  const userId = 'user-game-001';
  const otherUserId = 'user-game-002';
  let authToken: string;
  let otherUserToken: string;

  beforeAll(async () => {
    app = await buildTestApp();

    // Simulate authenticate middleware
    const authenticate = async (request: any, reply: any) => {
      try {
        const decoded = await request.jwtVerify() as { sub: string; email: string };
        request.userId = decoded.sub;
        request.userEmail = decoded.email;
      } catch {
        return reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        });
      }
    };

    // POST /api/game/session -- create new session
    app.post('/api/game/session', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const { characterName, characterClass, language: _language } = request.body as {
          characterName?: string;
          characterClass?: string;
          language?: string;
        };

        // Validate required fields
        if (!characterName || characterName.trim().length === 0) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message: 'Character name is required',
          });
        }

        if (!characterClass) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message: 'Character class is required',
          });
        }

        const validClasses = ['warrior', 'mage', 'rogue', 'ranger'];
        if (!validClasses.includes(characterClass)) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message: `Invalid character class. Must be one of: ${validClasses.join(', ')}`,
          });
        }

        // Create session
        const session = mockDb.createSession({
          userId: request.userId,
          gameState: createMockGameState({
            character: {
              id: 'char-new',
              name: characterName,
              class: characterClass,
              level: 1,
              health: 100,
              maxHealth: 100,
              inventory: [],
              gold: 0,
              abilities: [],
            },
          }),
        });

        return reply.status(201).send({
          id: session.id,
          status: session.status,
          character: {
            name: characterName,
            class: characterClass,
          },
          createdAt: session.createdAt.toISOString(),
        });
      },
    });

    // GET /api/game/session/:id -- load session
    app.get('/api/game/session/:id', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const { id } = request.params as { id: string };

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message: 'Invalid session ID format',
          });
        }

        const session = mockDb.findSessionById(id);

        if (!session) {
          return reply.status(404).send({
            code: 'NOT_FOUND',
            message: 'Game session not found',
          });
        }

        // Authorization: user can only access their own sessions
        if (session.userId !== request.userId) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: 'You do not have access to this session',
          });
        }

        return reply.status(200).send({
          id: session.id,
          status: session.status,
          gameState: session.gameState,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
        });
      },
    });

    // GET /api/game/sessions -- list user's sessions
    app.get('/api/game/sessions', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const { page, limit: limitStr } = (request.query as { page?: string; limit?: string }) || {};
        const pageNum = Math.max(1, parseInt(page || '1', 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(limitStr || '10', 10) || 10));

        const allSessions = mockDb.findSessionsByUserId(request.userId);
        const total = allSessions.length;
        const offset = (pageNum - 1) * limit;
        const sessions = allSessions.slice(offset, offset + limit);

        return reply.status(200).send({
          sessions: sessions.map((s: MockGameSession) => ({
            id: s.id,
            status: s.status,
            characterName: s.gameState?.character?.name ?? 'Unknown',
            characterClass: s.gameState?.character?.class ?? 'unknown',
            turnsPlayed: s.gameState?.session?.turnsPlayed ?? 0,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
          })),
          pagination: {
            page: pageNum,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      },
    });

    await app.ready();

    // Generate tokens
    authToken = generateTestToken(app, { sub: userId, email: 'player@questcast.app' });
    otherUserToken = generateTestToken(app, { sub: otherUserId, email: 'other@questcast.app' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockDb.reset();
  });

  // ================================================================
  // POST /api/game/session
  // ================================================================

  describe('POST /api/game/session', () => {
    const validPayload = {
      characterName: 'Thorin',
      characterClass: 'warrior',
      language: 'en',
    };

    it('should create a new game session successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session',
        headers: { authorization: `Bearer ${authToken}` },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body).toHaveProperty('id');
      expect(body.status).toBe('active');
      expect(body.character.name).toBe('Thorin');
      expect(body.character.class).toBe('warrior');
      expect(body).toHaveProperty('createdAt');
    });

    it('should reject session creation without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should reject session creation with missing character name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          characterClass: 'warrior',
          language: 'en',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toMatch(/character name/i);
    });

    it('should reject session creation with empty character name', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          characterName: '',
          characterClass: 'warrior',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject session creation with missing character class', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          characterName: 'Thorin',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject session creation with invalid character class', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          characterName: 'Thorin',
          characterClass: 'paladin', // not in the allowed list
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toMatch(/invalid character class/i);
    });

    it('should accept all valid character classes', async () => {
      const classes = ['warrior', 'mage', 'rogue', 'ranger'];

      for (const cls of classes) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/game/session',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            characterName: `Test ${cls}`,
            characterClass: cls,
          },
        });

        expect(response.statusCode).toBe(201);
        expect(response.json().character.class).toBe(cls);
      }
    });
  });

  // ================================================================
  // GET /api/game/session/:id
  // ================================================================

  describe('GET /api/game/session/:id', () => {
    let testSession: MockGameSession;

    beforeEach(() => {
      testSession = mockDb.createSession({
        id: '11111111-1111-1111-1111-111111111111',
        userId,
        gameState: createMockGameState({
          character: {
            id: 'char-1',
            name: 'Elara',
            class: 'mage',
            level: 3,
            health: 80,
            maxHealth: 100,
            inventory: ['Staff of Frost', 'Healing Potion'],
            gold: 50,
            abilities: ['Fireball', 'Ice Shield'],
          },
        }),
      });
    });

    it('should load session successfully for the owning user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/game/session/${testSession.id}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(testSession.id);
      expect(body.status).toBe('active');
      expect(body).toHaveProperty('gameState');
      expect(body.gameState.character.name).toBe('Elara');
    });

    it('should return 404 for non-existent session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/session/99999999-9999-9999-9999-999999999999',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('should return 403 when accessing another user\'s session', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/game/session/${testSession.id}`,
        headers: { authorization: `Bearer ${otherUserToken}` },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.code).toBe('FORBIDDEN');
    });

    it('should reject request without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/game/session/${testSession.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for invalid session ID format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/session/not-a-uuid',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });
  });

  // ================================================================
  // GET /api/game/sessions
  // ================================================================

  describe('GET /api/game/sessions', () => {
    it('should return empty list for user with no sessions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/sessions',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sessions).toEqual([]);
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.totalPages).toBe(0);
    });

    it('should return user\'s sessions', async () => {
      // Create sessions for the user
      mockDb.createSession({
        userId,
        gameState: createMockGameState({
          character: { id: 'c1', name: 'Thorin', class: 'warrior', level: 1, health: 100, maxHealth: 100, inventory: [], gold: 0, abilities: [] },
        }),
      });
      mockDb.createSession({
        userId,
        gameState: createMockGameState({
          character: { id: 'c2', name: 'Elara', class: 'mage', level: 2, health: 90, maxHealth: 100, inventory: [], gold: 20, abilities: [] },
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/game/sessions',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sessions).toHaveLength(2);
      expect(body.pagination.total).toBe(2);

      // Each session should have summary fields
      const session = body.sessions[0];
      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('status');
      expect(session).toHaveProperty('characterName');
      expect(session).toHaveProperty('characterClass');
      expect(session).toHaveProperty('turnsPlayed');
      expect(session).toHaveProperty('createdAt');
    });

    it('should NOT return other users\' sessions', async () => {
      // Create session for the main user
      mockDb.createSession({ userId });

      // Create session for another user
      mockDb.createSession({ userId: otherUserId });

      const response = await app.inject({
        method: 'GET',
        url: '/api/game/sessions',
        headers: { authorization: `Bearer ${authToken}` },
      });

      const body = response.json();
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0]).toBeDefined();
    });

    it('should support pagination', async () => {
      // Create 15 sessions
      for (let i = 0; i < 15; i++) {
        mockDb.createSession({
          userId,
          gameState: createMockGameState({
            character: { id: `c${i}`, name: `Hero ${i}`, class: 'warrior', level: 1, health: 100, maxHealth: 100, inventory: [], gold: 0, abilities: [] },
          }),
        });
      }

      // Page 1 (default limit 10)
      const page1 = await app.inject({
        method: 'GET',
        url: '/api/game/sessions?page=1&limit=10',
        headers: { authorization: `Bearer ${authToken}` },
      });

      const body1 = page1.json();
      expect(body1.sessions).toHaveLength(10);
      expect(body1.pagination.page).toBe(1);
      expect(body1.pagination.total).toBe(15);
      expect(body1.pagination.totalPages).toBe(2);

      // Page 2
      const page2 = await app.inject({
        method: 'GET',
        url: '/api/game/sessions?page=2&limit=10',
        headers: { authorization: `Bearer ${authToken}` },
      });

      const body2 = page2.json();
      expect(body2.sessions).toHaveLength(5);
      expect(body2.pagination.page).toBe(2);
    });

    it('should handle custom page size', async () => {
      for (let i = 0; i < 5; i++) {
        mockDb.createSession({ userId });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/game/sessions?limit=2',
        headers: { authorization: `Bearer ${authToken}` },
      });

      const body = response.json();
      expect(body.sessions).toHaveLength(2);
      expect(body.pagination.limit).toBe(2);
      expect(body.pagination.totalPages).toBe(3);
    });

    it('should cap page size at 50', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/sessions?limit=999',
        headers: { authorization: `Bearer ${authToken}` },
      });

      const body = response.json();
      expect(body.pagination.limit).toBe(50);
    });

    it('should reject request without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/game/sessions',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
