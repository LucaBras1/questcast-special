import { v4 as uuidv4 } from 'uuid';
import { prisma } from './prisma.js';
import type { Prisma } from '@prisma/client';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { CreateSessionInput } from '../models/schemas.js';
import type { GameState } from '../../../shared/types/index.js';
import type { AICost } from '../ai/types.js';
import {
  getSessionState,
  setSessionState,
  isRedisAvailable,
  pushToHistory,
  getHistory,
  type ConversationEntry,
} from './redis.js';
import {
  AUTO_SAVE_EVERY_N_TURNS,
  SOFT_SESSION_LIMIT_MINUTES,
  HARD_SESSION_LIMIT_MINUTES,
} from '../../../shared/constants/index.js';
import { getAIService } from '../ai/index.js';
import { assembleRecapPrompt, assembleSystemPrompt } from './prompt-service.js';

/**
 * Default starting game state for a new session.
 */
function createInitialGameState(sessionId: string, characterName: string): GameState {
  return {
    sessionId,
    character: {
      id: sessionId, // Will be overwritten
      name: characterName,
      class: 'warrior',
      level: 1,
      health: 100,
      maxHealth: 100,
      inventory: [],
      gold: 0,
      abilities: [],
    },
    story: {
      currentChapter: 1,
      currentLocation: 'Village Tavern',
      activeQuest: 'none',
      questProgress: 0,
      npcsMet: [],
      keyDecisions: [],
      narrativeSummary: '',
    },
    world: {
      timeOfDay: 'evening' as const,
      weather: 'clear',
      threatLevel: 'low' as const,
    },
    session: {
      turnsPlayed: 0,
      imagesGenerated: 0,
      timeElapsedMinutes: 0,
      lastSavedAt: new Date().toISOString(),
    },
  };
}

/**
 * Create a new game session with a new character.
 */
export async function createSession(userId: string, input: CreateSessionInput) {
  const sessionId = uuidv4();
  const characterId = uuidv4();

  // Create character
  const character = await prisma.character.create({
    data: {
      id: characterId,
      userId,
      name: input.characterName,
      class: input.characterClass,
    },
  });

  // Create initial game state
  const gameState = createInitialGameState(sessionId, input.characterName);
  gameState.character.id = characterId;
  gameState.character.class = input.characterClass;

  // Create session in PostgreSQL
  const session = await prisma.gameSession.create({
    data: {
      id: sessionId,
      userId,
      characterId: character.id,
      status: 'active',
      gameState: JSON.parse(JSON.stringify(gameState)),
    },
    include: {
      character: true,
    },
  });

  // Cache in Redis
  if (await isRedisAvailable()) {
    await setSessionState(sessionId, gameState);
  }

  logger.info('Game session created', { sessionId, userId, characterName: input.characterName });

  return {
    id: session.id,
    userId: session.userId,
    characterId: session.characterId,
    status: session.status,
    gameState,
    character: {
      id: character.id,
      name: character.name,
      class: character.class,
      level: character.level,
      health: character.health,
      maxHealth: character.maxHealth,
    },
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

/**
 * Get game state for a session.
 * Checks Redis first, falls back to PostgreSQL.
 */
export async function getGameState(sessionId: string): Promise<GameState> {
  // Try Redis first
  if (await isRedisAvailable()) {
    const cached = await getSessionState(sessionId);
    if (cached) {
      return cached;
    }
  }

  // Fall back to PostgreSQL
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new NotFoundError('Game session', sessionId);
  }

  const gameState = session.gameState as unknown as GameState;

  // Re-cache in Redis
  if (await isRedisAvailable()) {
    await setSessionState(sessionId, gameState);
  }

  return gameState;
}

/**
 * Update game state with partial updates from LLM response.
 * Always writes to Redis, writes to PostgreSQL every AUTO_SAVE_EVERY_N_TURNS turns.
 */
export async function updateGameState(
  sessionId: string,
  updates: {
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
    narrativeSummary?: string;
  },
): Promise<GameState> {
  const currentState = await getGameState(sessionId);

  // Apply updates
  if (updates.healthChange !== undefined) {
    currentState.character.health = Math.max(
      0,
      Math.min(currentState.character.maxHealth, currentState.character.health + updates.healthChange),
    );
  }

  if (updates.goldChange !== undefined) {
    currentState.character.gold = Math.max(0, currentState.character.gold + updates.goldChange);
  }

  if (updates.inventoryAdd?.length) {
    currentState.character.inventory.push(...updates.inventoryAdd);
  }

  if (updates.inventoryRemove?.length) {
    currentState.character.inventory = currentState.character.inventory.filter(
      (item) => !updates.inventoryRemove!.includes(item),
    );
  }

  if (updates.locationChange) {
    currentState.story.currentLocation = updates.locationChange;
  }

  if (updates.questUpdate) {
    currentState.story.activeQuest = updates.questUpdate;
  }

  if (updates.questProgress !== undefined) {
    currentState.story.questProgress = updates.questProgress;
  }

  if (updates.npcMet) {
    if (!currentState.story.npcsMet.includes(updates.npcMet)) {
      currentState.story.npcsMet.push(updates.npcMet);
    }
  }

  if (updates.keyDecision) {
    currentState.story.keyDecisions.push(updates.keyDecision);
  }

  if (updates.threatLevel) {
    currentState.world.threatLevel = updates.threatLevel;
  }

  if (updates.timeOfDay) {
    currentState.world.timeOfDay = updates.timeOfDay;
  }

  if (updates.narrativeSummary) {
    currentState.story.narrativeSummary = updates.narrativeSummary;
  }

  // Increment turns
  currentState.session.turnsPlayed++;
  currentState.session.lastSavedAt = new Date().toISOString();

  // Always write to Redis
  if (await isRedisAvailable()) {
    await setSessionState(sessionId, currentState);
  }

  // Write to PostgreSQL every N turns
  if (currentState.session.turnsPlayed % AUTO_SAVE_EVERY_N_TURNS === 0) {
    await saveToDatabase(sessionId, currentState);
  }

  return currentState;
}

/**
 * Save full game state snapshot to PostgreSQL.
 */
export async function saveToDatabase(sessionId: string, gameState?: GameState): Promise<void> {
  const state = gameState ?? (await getGameState(sessionId));

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      gameState: JSON.parse(JSON.stringify(state)),
    },
  });

  // Also update character stats
  if (state.character.id) {
    await prisma.character.update({
      where: { id: state.character.id },
      data: {
        level: state.character.level,
        health: state.character.health,
        maxHealth: state.character.maxHealth,
        inventory: state.character.inventory,
        gold: state.character.gold,
        abilities: state.character.abilities,
      },
    });
  }

  logger.info('Game state saved to database', {
    sessionId,
    turnsPlayed: state.session.turnsPlayed,
  });
}

/**
 * Record a game event (turn) in PostgreSQL.
 */
export async function recordGameEvent(
  sessionId: string,
  turnNumber: number,
  playerInput: string,
  aiResponse: string,
  gameStateSnapshot: GameState,
  aiCost: AICost,
): Promise<void> {
  await prisma.gameEvent.create({
    data: {
      id: uuidv4(),
      sessionId,
      turnNumber,
      playerInput,
      aiResponse,
      gameStateSnapshot: JSON.parse(JSON.stringify(gameStateSnapshot)),
      aiCost: JSON.parse(JSON.stringify(aiCost)),
    },
  });
}

/**
 * Add conversation entry to history (Redis).
 */
export async function addToConversationHistory(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  turnNumber: number,
): Promise<void> {
  const entry: ConversationEntry = {
    role,
    content,
    turnNumber,
    timestamp: new Date().toISOString(),
  };
  await pushToHistory(sessionId, entry);
}

/**
 * Get a session by ID, verifying ownership.
 */
export async function getSession(sessionId: string, userId: string) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      character: true,
    },
  });

  if (!session) {
    throw new NotFoundError('Game session', sessionId);
  }

  if (session.userId !== userId) {
    throw new ForbiddenError('You do not own this session');
  }

  return {
    id: session.id,
    userId: session.userId,
    characterId: session.characterId,
    status: session.status,
    gameState: session.gameState,
    character: {
      id: session.character.id,
      name: session.character.name,
      class: session.character.class,
      level: session.character.level,
      health: session.character.health,
      maxHealth: session.character.maxHealth,
    },
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

/**
 * Valid session status transitions.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  active: ['paused', 'completed'],
  paused: ['active'],
  completed: [], // terminal state
};

/**
 * Update session status with full lifecycle management.
 *
 * active -> paused:    Save full state snapshot to PostgreSQL
 * paused -> active:    Load state, generate AI recap
 * active -> completed: Final save, mark as complete
 */
export async function updateSessionStatus(
  sessionId: string,
  userId: string,
  newStatus: 'active' | 'paused' | 'completed',
): Promise<{ recap?: string }> {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new NotFoundError('Game session', sessionId);
  }

  if (session.userId !== userId) {
    throw new ForbiddenError('You do not own this session');
  }

  const currentStatus = session.status;

  // Validate transition
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] ?? [];
  if (!allowedTransitions.includes(newStatus)) {
    throw new ValidationError(
      `Cannot transition from '${currentStatus}' to '${newStatus}'`,
      { currentStatus, requestedStatus: newStatus, allowedTransitions },
    );
  }

  let recap: string | undefined;

  // ---- active -> paused: save full snapshot ----
  if (currentStatus === 'active' && newStatus === 'paused') {
    await saveSessionFull(sessionId);
    logger.info('Session paused with full save', { sessionId });
  }

  // ---- paused -> active: load state + generate recap ----
  if (currentStatus === 'paused' && newStatus === 'active') {
    const gameState = await loadSession(sessionId);
    recap = await generateRecap(sessionId, gameState);
    logger.info('Session resumed with recap', { sessionId });
  }

  // ---- active -> completed: final save ----
  if (currentStatus === 'active' && newStatus === 'completed') {
    await saveSessionFull(sessionId);
    logger.info('Session completed with final save', { sessionId });
  }

  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { status: newStatus },
  });

  logger.info('Session status updated', { sessionId, from: currentStatus, to: newStatus });

  return { recap };
}

/**
 * Load a session's full state into Redis from PostgreSQL.
 * Restores game state and conversation history (last 15 turns).
 */
export async function loadSession(sessionId: string): Promise<GameState> {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new NotFoundError('Game session', sessionId);
  }

  const gameState = session.gameState as unknown as GameState;

  // Re-cache game state in Redis
  if (await isRedisAvailable()) {
    await setSessionState(sessionId, gameState);
  }

  // Restore conversation history from game events (last 15 turns)
  const recentEvents = await prisma.gameEvent.findMany({
    where: { sessionId },
    orderBy: { turnNumber: 'desc' },
    take: 15,
  });

  if (recentEvents.length > 0 && (await isRedisAvailable())) {
    // Push events in chronological order (oldest first)
    const sorted = recentEvents.reverse();
    for (const event of sorted) {
      if (event.playerInput) {
        await pushToHistory(sessionId, {
          role: 'user',
          content: event.playerInput,
          turnNumber: event.turnNumber,
          timestamp: event.createdAt.toISOString(),
        });
      }
      if (event.aiResponse) {
        await pushToHistory(sessionId, {
          role: 'assistant',
          content: event.aiResponse,
          turnNumber: event.turnNumber,
          timestamp: event.createdAt.toISOString(),
        });
      }
    }
  }

  logger.info('Session loaded from database', {
    sessionId,
    turnsPlayed: gameState.session.turnsPlayed,
    historyRestored: recentEvents.length,
  });

  return gameState;
}

/**
 * Save full session state snapshot to PostgreSQL, including character sync
 * and conversation history snapshot.
 */
export async function saveSessionFull(sessionId: string): Promise<void> {
  const gameState = await getGameState(sessionId);

  // Save game state to PostgreSQL
  await saveToDatabase(sessionId, gameState);

  // Save conversation history snapshot alongside the game state
  if (await isRedisAvailable()) {
    const history = await getHistory(sessionId, 15);
    if (history.length > 0) {
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          gameState: JSON.parse(JSON.stringify({
            ...gameState,
            _conversationHistory: history,
          })),
        },
      });
    }
  }

  logger.info('Full session save completed', {
    sessionId,
    turnsPlayed: gameState.session.turnsPlayed,
  });
}

/**
 * Generate an AI recap narration when resuming a paused session.
 */
async function generateRecap(sessionId: string, gameState: GameState): Promise<string> {
  try {
    const recapPrompt = assembleRecapPrompt(
      gameState.character.name,
      gameState.story.currentLocation,
      gameState.story.activeQuest,
      gameState.story.narrativeSummary,
    );

    const systemPrompt = assembleSystemPrompt(
      'en',
      'teen',
      gameState,
      gameState.story.narrativeSummary,
    );

    const aiService = getAIService();
    const result = await aiService.generateNarration(
      systemPrompt,
      [{ role: 'user', content: recapPrompt }],
      gameState as unknown as Record<string, unknown>,
    );

    // Try to parse JSON response
    try {
      const parsed = JSON.parse(result.text);
      if (parsed.narration) {
        return parsed.narration;
      }
    } catch {
      // If not valid JSON, use raw text
    }

    return result.text;
  } catch (error) {
    logger.error('Failed to generate recap, using fallback', { sessionId, error });
    return `Welcome back, ${gameState.character.name}. You find yourself at ${gameState.story.currentLocation}. Your quest continues...`;
  }
}

/**
 * Check if a session has exceeded time limits.
 * Returns: 'ok' | 'soft_limit' (45 min warning) | 'hard_limit' (60 min, must end)
 */
export function checkSessionTimeLimit(
  gameState: GameState,
): 'ok' | 'soft_limit' | 'hard_limit' {
  const elapsed = gameState.session.timeElapsedMinutes;
  if (elapsed >= HARD_SESSION_LIMIT_MINUTES) return 'hard_limit';
  if (elapsed >= SOFT_SESSION_LIMIT_MINUTES) return 'soft_limit';
  return 'ok';
}

/**
 * Manually save session (force write to PostgreSQL).
 */
export async function manualSave(sessionId: string, userId: string): Promise<void> {
  // Verify ownership
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new NotFoundError('Game session', sessionId);
  }

  if (session.userId !== userId) {
    throw new ForbiddenError('You do not own this session');
  }

  await saveToDatabase(sessionId);
  logger.info('Manual session save completed', { sessionId });
}

/**
 * List all sessions for a user.
 */
export async function listSessions(
  userId: string,
  options: { status?: 'active' | 'paused' | 'completed'; limit?: number; offset?: number } = {},
) {
  const { status, limit = 20, offset = 0 } = options;

  const where: Prisma.GameSessionWhereInput = status ? { userId, status } : { userId };

  const [sessions, total] = await Promise.all([
    prisma.gameSession.findMany({
      where,
      include: {
        character: {
          select: {
            id: true,
            name: true,
            class: true,
            level: true,
            health: true,
            maxHealth: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.gameSession.count({ where }),
  ]);

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      character: s.character as unknown,
      gameState: s.gameState,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    total,
    limit,
    offset,
  };
}
