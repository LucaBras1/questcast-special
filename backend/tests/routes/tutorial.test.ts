/**
 * Tutorial Flow -- Test Suite
 *
 * Tests for:
 * - Tutorial session creation (special type)
 * - Tutorial beat progression (beat 1-5)
 * - Tutorial skip -- session cleaned up
 * - Tutorial completion -- navigation to character creation
 */

import { FastifyInstance } from 'fastify';
import {
  buildTestApp,
  generateTestToken,
  MockDatabase,
} from '../setup';

// ---- Mock Dependencies ----

const mockDb = new MockDatabase();

// Tutorial session state
interface TutorialSession {
  id: string;
  userId: string;
  type: 'tutorial';
  currentBeat: number;
  totalBeats: number;
  completed: boolean;
  skipped: boolean;
}

const tutorialSessions = new Map<string, TutorialSession>();
let tutorialIdCounter = 0;

function createTutorialSession(userId: string): TutorialSession {
  tutorialIdCounter++;
  const session: TutorialSession = {
    id: `tutorial-${tutorialIdCounter}`,
    userId,
    type: 'tutorial',
    currentBeat: 0,
    totalBeats: 5,
    completed: false,
    skipped: false,
  };
  tutorialSessions.set(session.id, session);
  return session;
}

describe('Tutorial Flow Routes', () => {
  let app: FastifyInstance;
  const userId = 'user-tutorial-001';
  let authToken: string;

  beforeAll(async () => {
    app = await buildTestApp();

    // Simulate authenticate middleware
    const authenticate = async (request: any, reply: any) => {
      try {
        const decoded = (await request.jwtVerify()) as { sub: string; email: string };
        request.userId = decoded.sub;
        request.userEmail = decoded.email;
      } catch {
        return reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        });
      }
    };

    // POST /api/game/tutorial -- create tutorial session
    app.post('/api/game/tutorial', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const session = createTutorialSession(request.userId);

        return reply.status(201).send({
          id: session.id,
          type: 'tutorial',
          currentBeat: session.currentBeat,
          totalBeats: session.totalBeats,
          message: 'Welcome, adventurer! Let me guide you through the basics.',
        });
      },
    });

    // POST /api/game/tutorial/:id/advance -- advance to next beat
    app.post('/api/game/tutorial/:id/advance', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const { id } = request.params as { id: string };
        const session = tutorialSessions.get(id);

        if (!session) {
          return reply.status(404).send({
            code: 'NOT_FOUND',
            message: 'Tutorial session not found',
          });
        }

        if (session.userId !== request.userId) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: 'Not your tutorial session',
          });
        }

        if (session.completed || session.skipped) {
          return reply.status(400).send({
            code: 'TUTORIAL_ENDED',
            message: 'Tutorial has already ended',
          });
        }

        session.currentBeat++;

        const beatNarrations: Record<number, string> = {
          1: 'You find yourself in a dimly lit tavern. Try speaking or typing your action.',
          2: 'The bartender slides a mysterious map across the counter. Tap the dice to roll!',
          3: 'A goblin bursts through the door! This is combat. Choose your action wisely.',
          4: 'You defeated the goblin! Check your inventory -- you found a rusty key.',
          5: 'You unlocked the cellar door. Your tutorial adventure is complete!',
        };

        if (session.currentBeat >= session.totalBeats) {
          session.completed = true;

          return reply.send({
            id: session.id,
            currentBeat: session.currentBeat,
            totalBeats: session.totalBeats,
            narration: beatNarrations[session.currentBeat] ?? 'Tutorial complete!',
            completed: true,
            nextStep: 'character_creation',
          });
        }

        return reply.send({
          id: session.id,
          currentBeat: session.currentBeat,
          totalBeats: session.totalBeats,
          narration: beatNarrations[session.currentBeat] ?? 'Continue your tutorial...',
          completed: false,
        });
      },
    });

    // POST /api/game/tutorial/:id/skip -- skip tutorial
    app.post('/api/game/tutorial/:id/skip', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const { id } = request.params as { id: string };
        const session = tutorialSessions.get(id);

        if (!session) {
          return reply.status(404).send({
            code: 'NOT_FOUND',
            message: 'Tutorial session not found',
          });
        }

        if (session.userId !== request.userId) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: 'Not your tutorial session',
          });
        }

        session.skipped = true;
        tutorialSessions.delete(id);

        return reply.send({
          success: true,
          message: 'Tutorial skipped',
          nextStep: 'character_creation',
        });
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
    tutorialSessions.clear();
    tutorialIdCounter = 0;
  });

  // ================================================================
  // Tutorial Session Creation
  // ================================================================

  describe('POST /api/game/tutorial', () => {
    it('should create a tutorial session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.id).toBeDefined();
      expect(body.type).toBe('tutorial');
      expect(body.currentBeat).toBe(0);
      expect(body.totalBeats).toBe(5);
      expect(body.message).toBeDefined();
    });

    it('should reject unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ================================================================
  // Tutorial Beat Progression
  // ================================================================

  describe('POST /api/game/tutorial/:id/advance', () => {
    it('should advance through beats 1-5', async () => {
      // Create tutorial
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial',
        headers: { authorization: `Bearer ${authToken}` },
      });
      const tutorialId = createResponse.json().id;

      // Advance through beats 1 to 4 (not completed yet)
      for (let beat = 1; beat <= 4; beat++) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/game/tutorial/${tutorialId}/advance`,
          headers: { authorization: `Bearer ${authToken}` },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.currentBeat).toBe(beat);
        expect(body.narration).toBeDefined();
        expect(body.narration.length).toBeGreaterThan(10);

        if (beat < 5) {
          expect(body.completed).toBe(false);
        }
      }

      // Beat 5 -- completion
      const finalResponse = await app.inject({
        method: 'POST',
        url: `/api/game/tutorial/${tutorialId}/advance`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(finalResponse.statusCode).toBe(200);
      const finalBody = finalResponse.json();
      expect(finalBody.currentBeat).toBe(5);
      expect(finalBody.completed).toBe(true);
      expect(finalBody.nextStep).toBe('character_creation');
    });

    it('should return unique narration for each beat', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial',
        headers: { authorization: `Bearer ${authToken}` },
      });
      const tutorialId = createResponse.json().id;

      const narrations: string[] = [];

      for (let beat = 1; beat <= 5; beat++) {
        const response = await app.inject({
          method: 'POST',
          url: `/api/game/tutorial/${tutorialId}/advance`,
          headers: { authorization: `Bearer ${authToken}` },
        });
        narrations.push(response.json().narration);
      }

      // All narrations should be unique
      const uniqueNarrations = new Set(narrations);
      expect(uniqueNarrations.size).toBe(5);
    });

    it('should return 404 for non-existent tutorial', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial/nonexistent/advance',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should reject advancing a completed tutorial', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial',
        headers: { authorization: `Bearer ${authToken}` },
      });
      const tutorialId = createResponse.json().id;

      // Complete the tutorial
      for (let beat = 1; beat <= 5; beat++) {
        await app.inject({
          method: 'POST',
          url: `/api/game/tutorial/${tutorialId}/advance`,
          headers: { authorization: `Bearer ${authToken}` },
        });
      }

      // Try to advance past completion
      const response = await app.inject({
        method: 'POST',
        url: `/api/game/tutorial/${tutorialId}/advance`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('TUTORIAL_ENDED');
    });
  });

  // ================================================================
  // Tutorial Skip
  // ================================================================

  describe('POST /api/game/tutorial/:id/skip', () => {
    it('should skip tutorial and clean up session', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial',
        headers: { authorization: `Bearer ${authToken}` },
      });
      const tutorialId = createResponse.json().id;

      // Skip
      const response = await app.inject({
        method: 'POST',
        url: `/api/game/tutorial/${tutorialId}/skip`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
      expect(response.json().nextStep).toBe('character_creation');

      // Verify session cleaned up
      const advanceResponse = await app.inject({
        method: 'POST',
        url: `/api/game/tutorial/${tutorialId}/advance`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      expect(advanceResponse.statusCode).toBe(404);
    });

    it('should allow skip at any beat', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial',
        headers: { authorization: `Bearer ${authToken}` },
      });
      const tutorialId = createResponse.json().id;

      // Advance to beat 2
      await app.inject({
        method: 'POST',
        url: `/api/game/tutorial/${tutorialId}/advance`,
        headers: { authorization: `Bearer ${authToken}` },
      });
      await app.inject({
        method: 'POST',
        url: `/api/game/tutorial/${tutorialId}/advance`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      // Skip at beat 2
      const response = await app.inject({
        method: 'POST',
        url: `/api/game/tutorial/${tutorialId}/skip`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
      expect(response.json().nextStep).toBe('character_creation');
    });

    it('should return 404 for non-existent tutorial', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial/nonexistent/skip',
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ================================================================
  // Tutorial Completion -> Character Creation
  // ================================================================

  describe('tutorial completion', () => {
    it('should direct user to character creation after completion', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial',
        headers: { authorization: `Bearer ${authToken}` },
      });
      const tutorialId = createResponse.json().id;

      // Complete all beats
      let lastResponse: any;
      for (let beat = 1; beat <= 5; beat++) {
        lastResponse = await app.inject({
          method: 'POST',
          url: `/api/game/tutorial/${tutorialId}/advance`,
          headers: { authorization: `Bearer ${authToken}` },
        });
      }

      expect(lastResponse.json().completed).toBe(true);
      expect(lastResponse.json().nextStep).toBe('character_creation');
    });

    it('should direct user to character creation after skip', async () => {
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/game/tutorial',
        headers: { authorization: `Bearer ${authToken}` },
      });
      const tutorialId = createResponse.json().id;

      const response = await app.inject({
        method: 'POST',
        url: `/api/game/tutorial/${tutorialId}/skip`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(response.json().nextStep).toBe('character_creation');
    });
  });
});
