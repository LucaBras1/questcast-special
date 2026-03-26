import { Redis } from '@upstash/redis';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import type { GameState } from '../../../shared/types/index.js';

/**
 * Redis client for session state caching, conversation history, and TTS cache.
 *
 * Key patterns:
 *   session:{id}:state   -- game state JSON (TTL: 2 hours)
 *   session:{id}:history -- conversation history as JSON list (TTL: 2 hours)
 *   session:{id}:events  -- SSE event buffer for reconnection (TTL: 30 min)
 *   tts:cache:{hash}     -- cached TTS audio base64 (TTL: 24 hours)
 */

const SESSION_STATE_TTL = 7200; // 2 hours
const SESSION_HISTORY_TTL = 7200; // 2 hours
const SSE_EVENT_BUFFER_TTL = 1800; // 30 minutes
const TTS_CACHE_TTL = 86400; // 24 hours
const MAX_SSE_BUFFER_SIZE = 50;

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    if (!config.REDIS_URL || !config.REDIS_TOKEN) {
      throw new Error('REDIS_URL and REDIS_TOKEN environment variables are required');
    }
    _redis = new Redis({
      url: config.REDIS_URL,
      token: config.REDIS_TOKEN,
    });
    logger.info('Redis client initialized');
  }
  return _redis;
}

/**
 * Check if Redis is available. Returns false if REDIS_URL is not set
 * or if the connection fails, allowing fallback to database-only mode.
 */
export async function isRedisAvailable(): Promise<boolean> {
  if (!config.REDIS_URL || !config.REDIS_TOKEN) return false;
  try {
    const redis = getRedis();
    await redis.ping();
    return true;
  } catch {
    logger.warn('Redis is not available, falling back to database-only mode');
    return false;
  }
}

// ---- Session State ----

export async function getSessionState(sessionId: string): Promise<GameState | null> {
  try {
    const redis = getRedis();
    const data = await redis.get<GameState>(`session:${sessionId}:state`);
    return data;
  } catch (error) {
    logger.error('Redis getSessionState failed', { sessionId, error });
    return null;
  }
}

export async function setSessionState(sessionId: string, state: GameState): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(`session:${sessionId}:state`, state, { ex: SESSION_STATE_TTL });
  } catch (error) {
    logger.error('Redis setSessionState failed', { sessionId, error });
  }
}

// ---- Conversation History ----

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
  turnNumber: number;
  timestamp: string;
}

export async function pushToHistory(
  sessionId: string,
  entry: ConversationEntry,
  maxEntries: number = 15,
): Promise<void> {
  try {
    const redis = getRedis();
    const key = `session:${sessionId}:history`;

    // Get current history
    const current = await redis.get<ConversationEntry[]>(key) ?? [];
    current.push(entry);

    // Trim to maxEntries (keep both user and assistant messages, cap at maxEntries * 2)
    const maxMessages = maxEntries * 2;
    const trimmed = current.length > maxMessages ? current.slice(-maxMessages) : current;

    await redis.set(key, trimmed, { ex: SESSION_HISTORY_TTL });
  } catch (error) {
    logger.error('Redis pushToHistory failed', { sessionId, error });
  }
}

export async function getHistory(
  sessionId: string,
  limit: number = 15,
): Promise<ConversationEntry[]> {
  try {
    const redis = getRedis();
    const key = `session:${sessionId}:history`;
    const history = await redis.get<ConversationEntry[]>(key) ?? [];

    // Return last N pairs (limit * 2 messages)
    const maxMessages = limit * 2;
    return history.length > maxMessages ? history.slice(-maxMessages) : history;
  } catch (error) {
    logger.error('Redis getHistory failed', { sessionId, error });
    return [];
  }
}

// ---- TTS Cache ----

export function ttsCacheKey(text: string, voice: string): string {
  // Simple hash: use first 8 chars of base64 of text + voice
  const input = `${voice}:${text}`;
  const hash = Buffer.from(input).toString('base64url').slice(0, 32);
  return `tts:cache:${hash}`;
}

export async function getCachedTTS(text: string, voice: string): Promise<string | null> {
  try {
    const redis = getRedis();
    const key = ttsCacheKey(text, voice);
    return await redis.get<string>(key);
  } catch (error) {
    logger.error('Redis getCachedTTS failed', { error });
    return null;
  }
}

export async function setCachedTTS(
  text: string,
  voice: string,
  audioBase64: string,
): Promise<void> {
  try {
    const redis = getRedis();
    const key = ttsCacheKey(text, voice);
    await redis.set(key, audioBase64, { ex: TTS_CACHE_TTL });
  } catch (error) {
    logger.error('Redis setCachedTTS failed', { error });
  }
}

// ---- SSE Event Buffer (for reconnection) ----

export interface BufferedSSEEvent {
  id: number;
  type: string;
  data: unknown;
  timestamp: number;
}

export async function bufferSSEEvent(
  sessionId: string,
  event: BufferedSSEEvent,
): Promise<void> {
  try {
    const redis = getRedis();
    const key = `session:${sessionId}:events`;

    const current = await redis.get<BufferedSSEEvent[]>(key) ?? [];
    current.push(event);

    // Keep only last MAX_SSE_BUFFER_SIZE events
    const trimmed =
      current.length > MAX_SSE_BUFFER_SIZE
        ? current.slice(-MAX_SSE_BUFFER_SIZE)
        : current;

    await redis.set(key, trimmed, { ex: SSE_EVENT_BUFFER_TTL });
  } catch (error) {
    logger.error('Redis bufferSSEEvent failed', { sessionId, error });
  }
}

export async function getBufferedSSEEvents(
  sessionId: string,
  afterId: number,
): Promise<BufferedSSEEvent[]> {
  try {
    const redis = getRedis();
    const key = `session:${sessionId}:events`;
    const events = await redis.get<BufferedSSEEvent[]>(key) ?? [];
    return events.filter((e) => e.id > afterId);
  } catch (error) {
    logger.error('Redis getBufferedSSEEvents failed', { sessionId, error });
    return [];
  }
}

export async function clearSSEEventBuffer(sessionId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`session:${sessionId}:events`);
  } catch (error) {
    logger.error('Redis clearSSEEventBuffer failed', { sessionId, error });
  }
}
