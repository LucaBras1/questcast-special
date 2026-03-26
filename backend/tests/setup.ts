/**
 * Questcast Backend -- Test Setup
 *
 * Provides:
 * - Fastify app builder for integration tests
 * - Mock factories for users, sessions, game states
 * - Test database helpers
 * - Common test utilities
 */

import Fastify, { FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';

// ---- Environment Setup ----

// Set test environment variables BEFORE any config import
process.env.NODE_ENV = 'development';
process.env.PORT = '0'; // random port
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/questcast_test';
process.env.OPENAI_API_KEY = 'sk-test-fake-key-for-testing-only';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env.CORS_ORIGIN = '*';

// ---- App Builder ----

/**
 * Builds a Fastify instance configured for testing.
 * Does NOT start listening -- use `app.inject()` for requests.
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // silence logs during tests
  });

  await app.register(cors, { origin: '*' });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '7d' },
  });

  // Health check (always available)
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
  }));

  return app;
}

// ---- JWT Helpers ----

/**
 * Generate a valid JWT token for testing authenticated routes.
 */
export function generateTestToken(
  app: FastifyInstance,
  payload: { sub: string; email: string },
): string {
  return app.jwt.sign(payload);
}

/**
 * Generate an expired JWT token for testing token expiry.
 */
export function generateExpiredToken(
  app: FastifyInstance,
  payload: { sub: string; email: string },
): string {
  return app.jwt.sign(payload, { expiresIn: '0s' });
}

// ---- Mock Factories ----

let idCounter = 0;

function nextId(): string {
  idCounter++;
  return `00000000-0000-0000-0000-${String(idCounter).padStart(12, '0')}`;
}

/**
 * Create a mock user object.
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const id = overrides.id ?? nextId();
  return {
    id,
    email: `testuser-${id.slice(-4)}@questcast.app`,
    passwordHash: '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehashfake',
    displayName: `Test User ${id.slice(-4)}`,
    language: 'en' as const,
    contentRating: 'teen' as const,
    createdAt: new Date('2026-03-25T10:00:00Z'),
    updatedAt: new Date('2026-03-25T10:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a mock character object.
 */
export function createMockCharacter(overrides: Partial<MockCharacter> = {}): MockCharacter {
  const id = overrides.id ?? nextId();
  return {
    id,
    userId: overrides.userId ?? nextId(),
    name: 'Thorin',
    class: 'warrior' as const,
    level: 1,
    health: 100,
    maxHealth: 100,
    inventory: [],
    gold: 0,
    abilities: ['Sword Strike', 'Shield Block'],
    createdAt: new Date('2026-03-25T10:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a mock game session object.
 */
export function createMockSession(overrides: Partial<MockGameSession> = {}): MockGameSession {
  const id = overrides.id ?? nextId();
  const userId = overrides.userId ?? nextId();
  const characterId = overrides.characterId ?? nextId();

  return {
    id,
    userId,
    characterId,
    status: 'active' as const,
    gameState: createMockGameState({ sessionId: id }),
    createdAt: new Date('2026-03-25T10:00:00Z'),
    updatedAt: new Date('2026-03-25T10:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a mock game state object matching the GameState type.
 */
export function createMockGameState(overrides: Partial<MockGameState> = {}): MockGameState {
  return {
    sessionId: overrides.sessionId ?? nextId(),
    character: {
      id: nextId(),
      name: 'Thorin',
      class: 'warrior',
      level: 1,
      health: 100,
      maxHealth: 100,
      inventory: ['Rusty Sword', 'Leather Shield'],
      gold: 10,
      abilities: ['Sword Strike', 'Shield Block'],
    },
    story: {
      currentChapter: 1,
      currentLocation: 'Misty Tavern',
      activeQuest: 'Find the Lost Amulet',
      questProgress: 10,
      npcsMet: ['Bartender Grog'],
      keyDecisions: [],
      narrativeSummary: 'The adventurer entered the Misty Tavern seeking information about the Lost Amulet.',
    },
    world: {
      timeOfDay: 'evening',
      weather: 'rainy',
      threatLevel: 'low',
    },
    session: {
      turnsPlayed: 3,
      imagesGenerated: 0,
      timeElapsedMinutes: 5,
      lastSavedAt: new Date('2026-03-25T10:05:00Z').toISOString(),
    },
    ...overrides,
  };
}

/**
 * Create a mock AI narration response (what the LLM returns after Zod parsing).
 */
export function createMockNarrationResponse(overrides: Partial<MockNarrationResponse> = {}): MockNarrationResponse {
  return {
    narration:
      'The heavy oak door creaks open, revealing a dimly lit corridor. Torches flicker along the stone walls, casting dancing shadows. At the far end, you hear the faint sound of footsteps echoing.',
    stateUpdates: {
      locationChange: 'Stone Corridor',
      threatLevel: 'moderate',
    },
    suggestedActions: [
      'Proceed cautiously down the corridor',
      'Listen carefully for the source of the footsteps',
      'Draw your weapon and advance',
    ],
    requiresDiceRoll: false,
    ...overrides,
  };
}

// ---- Mock Database Layer ----

/**
 * In-memory store for test data. Resets between tests.
 */
export class MockDatabase {
  users: MockUser[] = [];
  characters: MockCharacter[] = [];
  sessions: MockGameSession[] = [];

  reset(): void {
    this.users = [];
    this.characters = [];
    this.sessions = [];
    idCounter = 0;
  }

  // User CRUD
  findUserByEmail(email: string): MockUser | undefined {
    return this.users.find((u) => u.email === email);
  }

  findUserById(id: string): MockUser | undefined {
    return this.users.find((u) => u.id === id);
  }

  createUser(data: Omit<MockUser, 'id' | 'createdAt' | 'updatedAt'>): MockUser {
    const user = createMockUser(data);
    this.users.push(user);
    return user;
  }

  // Session CRUD
  findSessionById(id: string): MockGameSession | undefined {
    return this.sessions.find((s) => s.id === id);
  }

  findSessionsByUserId(userId: string): MockGameSession[] {
    return this.sessions.filter((s) => s.userId === userId);
  }

  createSession(data: Partial<MockGameSession>): MockGameSession {
    const session = createMockSession(data);
    this.sessions.push(session);
    return session;
  }
}

// ---- Type Definitions for Mocks ----

export interface MockUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  language: 'cs' | 'en';
  contentRating: 'family' | 'teen' | 'mature';
  createdAt: Date;
  updatedAt: Date;
}

export interface MockCharacter {
  id: string;
  userId: string;
  name: string;
  class: 'warrior' | 'mage' | 'rogue' | 'ranger';
  level: number;
  health: number;
  maxHealth: number;
  inventory: string[];
  gold: number;
  abilities: string[];
  createdAt: Date;
}

export interface MockGameSession {
  id: string;
  userId: string;
  characterId: string;
  status: 'active' | 'paused' | 'completed';
  gameState: MockGameState | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockGameState {
  sessionId: string;
  character: {
    id: string;
    name: string;
    class: string;
    level: number;
    health: number;
    maxHealth: number;
    inventory: string[];
    gold: number;
    abilities: string[];
  };
  story: {
    currentChapter: number;
    currentLocation: string;
    activeQuest: string;
    questProgress: number;
    npcsMet: string[];
    keyDecisions: string[];
    narrativeSummary: string;
  };
  world: {
    timeOfDay: string;
    weather: string;
    threatLevel: string;
  };
  session: {
    turnsPlayed: number;
    imagesGenerated: number;
    timeElapsedMinutes: number;
    lastSavedAt: string;
  };
}

export interface MockNarrationResponse {
  narration: string;
  stateUpdates?: {
    healthChange?: number;
    goldChange?: number;
    inventoryAdd?: string[];
    inventoryRemove?: string[];
    locationChange?: string;
    questUpdate?: string;
    questProgress?: number;
    npcMet?: string;
    keyDecision?: string;
    threatLevel?: 'low' | 'moderate' | 'high' | 'critical';
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  };
  suggestedActions?: string[];
  requiresDiceRoll?: boolean;
  diceRollReason?: string;
}

// ---- Cleanup ----

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
  idCounter = 0;
});
