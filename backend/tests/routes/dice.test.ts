/**
 * Dice Routes -- Test Suite
 *
 * Tests for:
 * - Valid dice roll (d4, d6, d8, d10, d12, d20)
 * - Invalid dice type rejection
 * - State updates applied from AI response
 * - Auth required (401 without token)
 * - Session status check (paused/completed rejected)
 */

import { buildTestApp, generateTestToken, createMockGameState } from '../setup';
import type { FastifyInstance } from 'fastify';

// ---- Mocks ----

const mockGameState = createMockGameState();

jest.mock('../../src/services/prisma', () => ({
  prisma: {
    gameSession: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: mockGameState.sessionId,
          userId: 'user-001',
          characterId: 'char-001',
          status: 'active',
          gameState: mockGameState,
          character: {
            id: 'char-001',
            name: 'Thorin',
            class: 'warrior',
            level: 1,
            health: 100,
            maxHealth: 100,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      update: jest.fn(() => Promise.resolve({})),
    },
    gameEvent: {
      create: jest.fn(() => Promise.resolve({})),
    },
    character: {
      update: jest.fn(() => Promise.resolve({})),
    },
  },
}));

jest.mock('../../src/services/redis', () => ({
  isRedisAvailable: jest.fn(() => Promise.resolve(false)),
  getSessionState: jest.fn(() => Promise.resolve(null)),
  setSessionState: jest.fn(() => Promise.resolve()),
  getRedis: jest.fn(() => ({
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve()),
    del: jest.fn(() => Promise.resolve()),
  })),
  pushToHistory: jest.fn(() => Promise.resolve()),
  getHistory: jest.fn(() => Promise.resolve([])),
  bufferSSEEvent: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/services/prompt-service', () => ({
  loadPromptTemplates: jest.fn(),
  assembleSystemPrompt: jest.fn(() => 'You are a DM.'),
  assembleDicePrompt: jest.fn(() => 'Dice roll prompt'),
}));

jest.mock('../../src/ai/index', () => ({
  getAIService: jest.fn(() => ({
    generateNarration: jest.fn(() =>
      Promise.resolve({
        text: JSON.stringify({
          narration: 'Your sword strikes true!',
          outcome: 'success',
          stateUpdates: { healthChange: -5 },
        }),
        parsedResponse: null,
        promptTokens: 100,
        completionTokens: 50,
        cost: { llmInputCost: 0.001, llmOutputCost: 0.002 },
      }),
    ),
  })),
}));

jest.mock('../../src/services/tts-cache', () => ({
  synthesizeWithCache: jest.fn(() =>
    Promise.resolve({
      audioBase64: 'dGVzdA==',
      format: 'opus',
      durationSeconds: 2,
      cost: 0.001,
      cached: false,
    }),
  ),
}));

jest.mock('../../src/services/cost-tracker', () => ({
  TurnCostTracker: jest.fn().mockImplementation(() => ({
    addLLMCost: jest.fn(),
    addTTSCost: jest.fn(),
    finalize: jest.fn(() => ({
      sttCost: 0,
      llmInputCost: 0.001,
      llmOutputCost: 0.002,
      ttsCost: 0.001,
      imageCost: 0,
      totalCost: 0.004,
    })),
  })),
}));

jest.mock('../../src/services/combat-service', () => ({
  getActiveCombat: jest.fn(() => Promise.resolve(null)),
  processCombatAction: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/utils/sentry', () => ({
  registerSentry: jest.fn(),
  sentryErrorHandler: jest.fn(),
}));

import { diceRoutes } from '../../src/routes/dice';
import { authenticate } from '../../src/middleware/authenticate';
import { errorHandler } from '../../src/middleware/error-handler';
import { prisma } from '../../src/services/prisma';

// ---- Test Setup ----

let app: FastifyInstance;
let authToken: string;

beforeAll(async () => {
  app = await buildTestApp();

  // Register error handler (needed for Zod validation errors to return 400)
  app.setErrorHandler(errorHandler);

  // Register dice routes under /api/game prefix
  await app.register(
    async (instance) => {
      instance.addHook('preHandler', authenticate);
      await instance.register(diceRoutes);
    },
    { prefix: '/api/game' },
  );

  await app.ready();

  authToken = generateTestToken(app, { sub: 'user-001', email: 'test@questcast.app' });
});

afterAll(async () => {
  await app.close();
});

// ---- Tests ----

describe('POST /api/game/session/:id/dice', () => {
  const sessionId = mockGameState.sessionId;
  const url = `/api/game/session/${sessionId}/dice`;

  describe('valid dice rolls', () => {
    it('should accept a d20 roll and return result', async () => {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          diceType: 'd20',
          actionType: 'attack',
          modifiers: 2,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.rollValue).toBeGreaterThanOrEqual(1);
      expect(body.rollValue).toBeLessThanOrEqual(20);
      expect(body.diceType).toBe('d20');
      expect(body.modifiers).toBe(2);
      expect(body.total).toBe(body.rollValue + 2);
      expect(body.narration).toBeDefined();
      expect(typeof body.success).toBe('boolean');
      expect(body.difficultyClass).toBeGreaterThan(0);
    });

    it('should accept a d6 roll', async () => {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          diceType: 'd6',
          actionType: 'investigate',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.rollValue).toBeGreaterThanOrEqual(1);
      expect(body.rollValue).toBeLessThanOrEqual(6);
      expect(body.diceType).toBe('d6');
    });

    it.each(['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] as const)(
      'should accept %s dice type',
      async (diceType) => {
        const maxValues: Record<string, number> = {
          d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20,
        };

        const response = await app.inject({
          method: 'POST',
          url,
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            diceType,
            actionType: 'attack',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.rollValue).toBeGreaterThanOrEqual(1);
        expect(body.rollValue).toBeLessThanOrEqual(maxValues[diceType]);
      },
    );
  });

  describe('invalid dice type', () => {
    it('should reject an invalid dice type with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          diceType: 'd100',
          actionType: 'attack',
        },
      });

      // Zod validation should reject d100 as it is not in the enum
      expect(response.statusCode).toBe(400);
    });

    it('should reject missing diceType', async () => {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          actionType: 'attack',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject missing actionType', async () => {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          diceType: 'd20',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('state updates applied', () => {
    it('should include stateUpdates in the response', async () => {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          diceType: 'd20',
          actionType: 'attack',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      // The mock AI returns stateUpdates with healthChange: -5
      expect(body.stateUpdates).toBeDefined();
    });

    it('should include cost information', async () => {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          diceType: 'd20',
          actionType: 'spell',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.cost).toBeDefined();
      expect(body.cost.totalCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('authentication required', () => {
    it('should return 401 without authorization header', async () => {
      const response = await app.inject({
        method: 'POST',
        url,
        payload: {
          diceType: 'd20',
          actionType: 'attack',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: 'Bearer invalid-token-here' },
        payload: {
          diceType: 'd20',
          actionType: 'attack',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('session status enforcement', () => {
    it('should reject dice roll for paused session', async () => {
      (prisma.gameSession.findUnique as jest.Mock).mockResolvedValueOnce({
        id: sessionId,
        userId: 'user-001',
        characterId: 'char-001',
        status: 'paused',
        gameState: mockGameState,
        character: { id: 'char-001', name: 'Thorin', class: 'warrior', level: 1, health: 100, maxHealth: 100 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          diceType: 'd20',
          actionType: 'attack',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('SESSION_NOT_ACTIVE');
    });

    it('should reject dice roll for completed session', async () => {
      (prisma.gameSession.findUnique as jest.Mock).mockResolvedValueOnce({
        id: sessionId,
        userId: 'user-001',
        characterId: 'char-001',
        status: 'completed',
        gameState: mockGameState,
        character: { id: 'char-001', name: 'Thorin', class: 'warrior', level: 1, health: 100, maxHealth: 100 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          diceType: 'd20',
          actionType: 'attack',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('SESSION_NOT_ACTIVE');
    });
  });

  describe('invalid session ID', () => {
    it('should reject non-UUID session ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/not-a-uuid/dice',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          diceType: 'd20',
          actionType: 'attack',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
