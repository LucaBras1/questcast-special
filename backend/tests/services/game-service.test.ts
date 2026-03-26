/**
 * Game Service -- Unit Tests
 *
 * Tests the actual game-service functions with mocked Prisma and Redis.
 * Covers: createSession, getGameState, updateGameState, getSession,
 *         updateSessionStatus, listSessions, checkSessionTimeLimit, manualSave
 */

import { createMockGameState } from '../setup';

// ---- Mock Dependencies ----

const mockPrismaCharacter = {
  create: jest.fn(),
  update: jest.fn(),
};
const mockPrismaGameSession = {
  create: jest.fn(),
  findUnique: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  count: jest.fn(),
};
const mockPrismaGameEvent = {
  create: jest.fn(),
  findMany: jest.fn(),
};
const mockPrismaUserPreferences = {
  create: jest.fn(),
};

jest.mock('../../src/services/prisma', () => ({
  prisma: {
    character: mockPrismaCharacter,
    gameSession: mockPrismaGameSession,
    gameEvent: mockPrismaGameEvent,
    userPreferences: mockPrismaUserPreferences,
  },
}));

// Mock Redis
const mockIsRedisAvailable = jest.fn().mockResolvedValue(false);
const mockGetSessionState = jest.fn().mockResolvedValue(null);
const mockSetSessionState = jest.fn().mockResolvedValue(undefined);
const mockPushToHistory = jest.fn().mockResolvedValue(undefined);
const mockGetHistory = jest.fn().mockResolvedValue([]);

jest.mock('../../src/services/redis', () => ({
  isRedisAvailable: (...args: unknown[]) => mockIsRedisAvailable(...args),
  getSessionState: (...args: unknown[]) => mockGetSessionState(...args),
  setSessionState: (...args: unknown[]) => mockSetSessionState(...args),
  pushToHistory: (...args: unknown[]) => mockPushToHistory(...args),
  getHistory: (...args: unknown[]) => mockGetHistory(...args),
}));

// Mock uuid
let uuidCounter = 0;
jest.mock('uuid', () => ({
  v4: jest.fn(() => `uuid-${++uuidCounter}`),
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Mock shared constants
jest.mock('../../../shared/constants/index', () => ({
  AUTO_SAVE_EVERY_N_TURNS: 5,
  SOFT_SESSION_LIMIT_MINUTES: 45,
  HARD_SESSION_LIMIT_MINUTES: 60,
}));

// Mock AI service (for recap generation)
jest.mock('../../src/ai/index', () => ({
  getAIService: jest.fn(() => ({
    generateNarration: jest.fn().mockResolvedValue({
      text: '{"narration":"Welcome back, adventurer!"}',
      parsedResponse: { narration: 'Welcome back, adventurer!' },
      promptTokens: 100,
      completionTokens: 50,
      cost: { llmInputCost: 0.001, llmOutputCost: 0.001 },
    }),
  })),
}));

// Mock prompt service
jest.mock('../../src/services/prompt-service', () => ({
  assembleRecapPrompt: jest.fn().mockReturnValue('recap prompt'),
  assembleSystemPrompt: jest.fn().mockReturnValue('system prompt'),
}));

import {
  createSession,
  getGameState,
  updateGameState,
  getSession,
  updateSessionStatus,
  listSessions,
  checkSessionTimeLimit,
  manualSave,
  recordGameEvent,
} from '../../src/services/game-service';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from '../../src/utils/errors';

describe('Game Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    uuidCounter = 0;
  });

  // ================================================================
  // createSession
  // ================================================================

  describe('createSession', () => {
    it('should create a session with character and game state', async () => {
      mockPrismaCharacter.create.mockResolvedValue({
        id: 'uuid-2',
        userId: 'user-1',
        name: 'Thorin',
        class: 'warrior',
        level: 1,
        health: 50,
        maxHealth: 50,
      });
      mockPrismaGameSession.create.mockResolvedValue({
        id: 'uuid-1',
        userId: 'user-1',
        characterId: 'uuid-2',
        status: 'active',
        gameState: {},
        character: {
          id: 'uuid-2',
          name: 'Thorin',
          class: 'warrior',
          level: 1,
          health: 50,
          maxHealth: 50,
        },
        createdAt: new Date('2026-03-25'),
        updatedAt: new Date('2026-03-25'),
      });

      const result = await createSession('user-1', {
        characterName: 'Thorin',
        characterClass: 'warrior',
        language: 'en',
      });

      expect(result.id).toBeTruthy();
      expect(result.userId).toBe('user-1');
      expect(result.status).toBe('active');
      expect(result.character.name).toBe('Thorin');
      expect(result.character.class).toBe('warrior');
      expect(result.gameState).toBeDefined();
      expect(result.gameState.character.name).toBe('Thorin');
    });

    it('should set class-specific starting stats for warrior', async () => {
      mockPrismaCharacter.create.mockResolvedValue({ id: 'uuid-2' });
      mockPrismaGameSession.create.mockImplementation((args: { data: { gameState: unknown }; include: unknown }) => ({
        ...args.data,
        id: 'uuid-1',
        character: { id: 'uuid-2', name: 'Thorin', class: 'warrior', level: 1, health: 50, maxHealth: 50 },
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await createSession('user-1', {
        characterName: 'Thorin',
        characterClass: 'warrior',
        language: 'en',
      });

      expect(result.gameState.character.health).toBe(50);
      expect(result.gameState.character.maxHealth).toBe(50);
      expect(result.gameState.character.inventory).toContain('sword');
      expect(result.gameState.character.inventory).toContain('shield');
    });

    it('should set class-specific starting stats for mage', async () => {
      mockPrismaCharacter.create.mockResolvedValue({ id: 'uuid-2' });
      mockPrismaGameSession.create.mockImplementation((args: { data: { gameState: unknown }; include: unknown }) => ({
        ...args.data,
        id: 'uuid-1',
        character: { id: 'uuid-2', name: 'Gandalf', class: 'mage', level: 1, health: 30, maxHealth: 30 },
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await createSession('user-1', {
        characterName: 'Gandalf',
        characterClass: 'mage',
        language: 'en',
      });

      expect(result.gameState.character.health).toBe(30);
      expect(result.gameState.character.maxHealth).toBe(30);
      expect(result.gameState.character.inventory).toContain('staff');
      expect(result.gameState.character.inventory).toContain('spellbook');
    });

    it('should initialize game state with default story values', async () => {
      mockPrismaCharacter.create.mockResolvedValue({ id: 'uuid-2' });
      mockPrismaGameSession.create.mockImplementation((args: { data: { gameState: unknown }; include: unknown }) => ({
        ...args.data,
        id: 'uuid-1',
        character: { id: 'uuid-2', name: 'Test', class: 'warrior', level: 1, health: 50, maxHealth: 50 },
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await createSession('user-1', {
        characterName: 'Test',
        characterClass: 'warrior',
        language: 'en',
      });

      expect(result.gameState.story.currentLocation).toBe('Village Tavern');
      expect(result.gameState.story.currentChapter).toBe(1);
      expect(result.gameState.session.turnsPlayed).toBe(0);
      expect(result.gameState.world.threatLevel).toBe('low');
    });

    it('should cache game state in Redis when available', async () => {
      mockIsRedisAvailable.mockResolvedValue(true);
      mockPrismaCharacter.create.mockResolvedValue({ id: 'uuid-2' });
      mockPrismaGameSession.create.mockResolvedValue({
        id: 'uuid-1',
        userId: 'user-1',
        characterId: 'uuid-2',
        status: 'active',
        gameState: {},
        character: { id: 'uuid-2', name: 'Test', class: 'warrior', level: 1, health: 50, maxHealth: 50 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await createSession('user-1', {
        characterName: 'Test',
        characterClass: 'warrior',
        language: 'en',
      });

      expect(mockSetSessionState).toHaveBeenCalled();
    });
  });

  // ================================================================
  // getGameState
  // ================================================================

  describe('getGameState', () => {
    it('should return game state from Redis when available', async () => {
      const mockState = createMockGameState({ sessionId: 'session-1' });
      mockIsRedisAvailable.mockResolvedValue(true);
      mockGetSessionState.mockResolvedValue(mockState);

      const result = await getGameState('session-1');

      expect(result).toEqual(mockState);
      expect(mockPrismaGameSession.findUnique).not.toHaveBeenCalled();
    });

    it('should fall back to PostgreSQL when Redis is unavailable', async () => {
      const mockState = createMockGameState({ sessionId: 'session-1' });
      mockIsRedisAvailable.mockResolvedValue(false);
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        gameState: mockState,
      });

      const result = await getGameState('session-1');

      expect(result).toEqual(mockState);
    });

    it('should fall back to PostgreSQL when Redis cache miss', async () => {
      const mockState = createMockGameState({ sessionId: 'session-1' });
      mockIsRedisAvailable.mockResolvedValue(true);
      mockGetSessionState.mockResolvedValue(null);
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        gameState: mockState,
      });

      const result = await getGameState('session-1');

      expect(result).toEqual(mockState);
      // Should re-cache in Redis
      expect(mockSetSessionState).toHaveBeenCalledWith('session-1', mockState);
    });

    it('should throw NotFoundError when session does not exist', async () => {
      mockIsRedisAvailable.mockResolvedValue(false);
      mockPrismaGameSession.findUnique.mockResolvedValue(null);

      await expect(getGameState('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  // ================================================================
  // updateGameState
  // ================================================================

  describe('updateGameState', () => {
    const baseState = () => createMockGameState({
      sessionId: 'session-1',
      character: {
        id: 'char-1',
        name: 'Thorin',
        class: 'warrior',
        level: 1,
        health: 40,
        maxHealth: 50,
        inventory: ['sword', 'shield'],
        gold: 10,
        abilities: ['power_strike'],
      },
    });

    beforeEach(() => {
      mockIsRedisAvailable.mockResolvedValue(true);
      mockGetSessionState.mockResolvedValue(baseState());
    });

    it('should apply health change clamped to [0, maxHealth]', async () => {
      const result = await updateGameState('session-1', { healthChange: -50 });
      expect(result.character.health).toBe(0); // clamped to 0

      mockGetSessionState.mockResolvedValue(baseState());
      const result2 = await updateGameState('session-1', { healthChange: 100 });
      expect(result2.character.health).toBe(50); // clamped to maxHealth
    });

    it('should apply gold change floored at 0', async () => {
      const result = await updateGameState('session-1', { goldChange: -100 });
      expect(result.character.gold).toBe(0);
    });

    it('should add items to inventory', async () => {
      const result = await updateGameState('session-1', {
        inventoryAdd: ['potion', 'key'],
      });
      expect(result.character.inventory).toContain('potion');
      expect(result.character.inventory).toContain('key');
      expect(result.character.inventory).toContain('sword'); // existing item
    });

    it('should remove items from inventory', async () => {
      const result = await updateGameState('session-1', {
        inventoryRemove: ['sword'],
      });
      expect(result.character.inventory).not.toContain('sword');
      expect(result.character.inventory).toContain('shield');
    });

    it('should update location', async () => {
      const result = await updateGameState('session-1', {
        locationChange: 'Dark Forest',
      });
      expect(result.story.currentLocation).toBe('Dark Forest');
    });

    it('should update quest and progress', async () => {
      const result = await updateGameState('session-1', {
        questUpdate: 'Find the Dragon',
        questProgress: 50,
      });
      expect(result.story.activeQuest).toBe('Find the Dragon');
      expect(result.story.questProgress).toBe(50);
    });

    it('should add NPC without duplicates', async () => {
      const state = baseState();
      state.story.npcsMet = ['Bartender'];
      mockGetSessionState.mockResolvedValue(state);

      const result = await updateGameState('session-1', { npcMet: 'Bartender' });
      const count = result.story.npcsMet.filter((n: string) => n === 'Bartender').length;
      expect(count).toBe(1); // no duplicate
    });

    it('should update threat level and time of day', async () => {
      const result = await updateGameState('session-1', {
        threatLevel: 'critical',
        timeOfDay: 'night',
      });
      expect(result.world.threatLevel).toBe('critical');
      expect(result.world.timeOfDay).toBe('night');
    });

    it('should increment turnsPlayed on each update', async () => {
      const state = baseState();
      state.session.turnsPlayed = 3;
      mockGetSessionState.mockResolvedValue(state);

      const result = await updateGameState('session-1', {});
      expect(result.session.turnsPlayed).toBe(4);
    });

    it('should auto-save to database every N turns', async () => {
      const state = baseState();
      state.session.turnsPlayed = 4; // will become 5 after increment
      mockGetSessionState.mockResolvedValue(state);

      await updateGameState('session-1', {});

      // Should save to database (turnsPlayed 5 % 5 === 0)
      expect(mockPrismaGameSession.update).toHaveBeenCalled();
    });

    it('should NOT auto-save on non-divisible turn', async () => {
      const state = baseState();
      state.session.turnsPlayed = 2; // will become 3
      mockGetSessionState.mockResolvedValue(state);

      await updateGameState('session-1', {});

      expect(mockPrismaGameSession.update).not.toHaveBeenCalled();
    });

    it('should always write to Redis', async () => {
      await updateGameState('session-1', { healthChange: -5 });
      expect(mockSetSessionState).toHaveBeenCalled();
    });
  });

  // ================================================================
  // getSession (ownership check)
  // ================================================================

  describe('getSession', () => {
    it('should return session for the owning user', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        characterId: 'char-1',
        status: 'active',
        gameState: {},
        character: { id: 'char-1', name: 'Thorin', class: 'warrior', level: 1, health: 50, maxHealth: 50 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getSession('session-1', 'user-1');

      expect(result.id).toBe('session-1');
      expect(result.character.name).toBe('Thorin');
    });

    it('should throw NotFoundError for non-existent session', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue(null);

      await expect(getSession('nonexistent', 'user-1')).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError when user does not own session', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        characterId: 'char-1',
        status: 'active',
        gameState: {},
        character: { id: 'char-1', name: 'Thorin', class: 'warrior', level: 1, health: 50, maxHealth: 50 },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(getSession('session-1', 'user-2')).rejects.toThrow(ForbiddenError);
    });
  });

  // ================================================================
  // updateSessionStatus
  // ================================================================

  describe('updateSessionStatus', () => {
    it('should allow active -> paused transition', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        status: 'active',
        gameState: createMockGameState(),
      });
      mockPrismaGameSession.update.mockResolvedValue({});
      // getGameState for saveSessionFull
      mockIsRedisAvailable.mockResolvedValue(false);

      const result = await updateSessionStatus('session-1', 'user-1', 'paused');

      expect(mockPrismaGameSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1' },
          data: { status: 'paused' },
        }),
      );
      expect(result).toBeDefined();
    });

    it('should allow active -> completed transition', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        status: 'active',
        gameState: createMockGameState(),
      });
      mockPrismaGameSession.update.mockResolvedValue({});
      mockIsRedisAvailable.mockResolvedValue(false);

      await updateSessionStatus('session-1', 'user-1', 'completed');

      expect(mockPrismaGameSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'completed' },
        }),
      );
    });

    it('should allow paused -> active transition with recap', async () => {
      const gameState = createMockGameState();
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        status: 'paused',
        gameState,
      });
      mockPrismaGameSession.update.mockResolvedValue({});
      mockPrismaGameEvent.findMany.mockResolvedValue([]);
      mockIsRedisAvailable.mockResolvedValue(false);

      const result = await updateSessionStatus('session-1', 'user-1', 'active');

      expect(result.recap).toBeDefined();
    });

    it('should reject completed -> active transition', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        status: 'completed',
      });

      await expect(
        updateSessionStatus('session-1', 'user-1', 'active'),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject completed -> paused transition', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        status: 'completed',
      });

      await expect(
        updateSessionStatus('session-1', 'user-1', 'paused'),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject paused -> completed transition', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        status: 'paused',
      });

      await expect(
        updateSessionStatus('session-1', 'user-1', 'completed'),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError for non-existent session', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue(null);

      await expect(
        updateSessionStatus('nonexistent', 'user-1', 'paused'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError when user does not own session', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'other-user',
        status: 'active',
      });

      await expect(
        updateSessionStatus('session-1', 'user-1', 'paused'),
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // ================================================================
  // listSessions
  // ================================================================

  describe('listSessions', () => {
    it('should return sessions for a user with pagination', async () => {
      const sessions = [
        {
          id: 's1',
          status: 'active',
          gameState: {},
          character: { id: 'c1', name: 'Thorin', class: 'warrior', level: 1, health: 50, maxHealth: 50 },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrismaGameSession.findMany.mockResolvedValue(sessions);
      mockPrismaGameSession.count.mockResolvedValue(1);

      const result = await listSessions('user-1');

      expect(result.sessions).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should return empty list for user with no sessions', async () => {
      mockPrismaGameSession.findMany.mockResolvedValue([]);
      mockPrismaGameSession.count.mockResolvedValue(0);

      const result = await listSessions('user-no-sessions');

      expect(result.sessions).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should filter by status', async () => {
      mockPrismaGameSession.findMany.mockResolvedValue([]);
      mockPrismaGameSession.count.mockResolvedValue(0);

      await listSessions('user-1', { status: 'active' });

      expect(mockPrismaGameSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', status: 'active' },
        }),
      );
    });

    it('should respect limit and offset', async () => {
      mockPrismaGameSession.findMany.mockResolvedValue([]);
      mockPrismaGameSession.count.mockResolvedValue(50);

      const result = await listSessions('user-1', { limit: 10, offset: 20 });

      expect(mockPrismaGameSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);
    });
  });

  // ================================================================
  // checkSessionTimeLimit
  // ================================================================

  describe('checkSessionTimeLimit', () => {
    it('should return ok for sessions under 45 minutes', () => {
      const state = createMockGameState();
      state.session.timeElapsedMinutes = 30;

      expect(checkSessionTimeLimit(state as any)).toBe('ok');
    });

    it('should return soft_limit at 45 minutes', () => {
      const state = createMockGameState();
      state.session.timeElapsedMinutes = 45;

      expect(checkSessionTimeLimit(state as any)).toBe('soft_limit');
    });

    it('should return soft_limit between 45-59 minutes', () => {
      const state = createMockGameState();
      state.session.timeElapsedMinutes = 55;

      expect(checkSessionTimeLimit(state as any)).toBe('soft_limit');
    });

    it('should return hard_limit at 60 minutes', () => {
      const state = createMockGameState();
      state.session.timeElapsedMinutes = 60;

      expect(checkSessionTimeLimit(state as any)).toBe('hard_limit');
    });

    it('should return hard_limit above 60 minutes', () => {
      const state = createMockGameState();
      state.session.timeElapsedMinutes = 90;

      expect(checkSessionTimeLimit(state as any)).toBe('hard_limit');
    });

    it('should return ok at 0 minutes', () => {
      const state = createMockGameState();
      state.session.timeElapsedMinutes = 0;

      expect(checkSessionTimeLimit(state as any)).toBe('ok');
    });
  });

  // ================================================================
  // manualSave
  // ================================================================

  describe('manualSave', () => {
    it('should save session for the owning user', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
        gameState: createMockGameState(),
      });
      mockIsRedisAvailable.mockResolvedValue(false);
      mockPrismaGameSession.update.mockResolvedValue({});
      mockPrismaCharacter.update.mockResolvedValue({});

      await expect(manualSave('session-1', 'user-1')).resolves.toBeUndefined();
    });

    it('should throw NotFoundError for non-existent session', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue(null);

      await expect(manualSave('nonexistent', 'user-1')).rejects.toThrow(NotFoundError);
    });

    it('should throw ForbiddenError when user does not own session', async () => {
      mockPrismaGameSession.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: 'other-user',
      });

      await expect(manualSave('session-1', 'user-1')).rejects.toThrow(ForbiddenError);
    });
  });

  // ================================================================
  // recordGameEvent
  // ================================================================

  describe('recordGameEvent', () => {
    it('should create a game event record', async () => {
      const gameState = createMockGameState();
      const aiCost = {
        sttCost: 0.001,
        llmInputCost: 0.002,
        llmOutputCost: 0.003,
        ttsCost: 0.004,
        imageCost: 0,
        totalCost: 0.01,
      };

      await recordGameEvent('session-1', 5, 'I open the door', 'The door creaks open.', gameState as any, aiCost);

      expect(mockPrismaGameEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'session-1',
            turnNumber: 5,
            playerInput: 'I open the door',
            aiResponse: 'The door creaks open.',
          }),
        }),
      );
    });
  });
});
