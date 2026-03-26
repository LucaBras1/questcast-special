/**
 * Redis Service -- Test Suite
 *
 * Tests for:
 * - Session state CRUD (get, set, update, delete)
 * - Conversation history (push, get last N, trim)
 * - TTS cache (set, get, cache hit/miss, TTL)
 * - Key patterns (correct naming conventions)
 * - Concurrent access patterns
 *
 * All Redis calls are mocked -- no real Redis connection needed.
 */

import { createMockGameState } from '../setup';

// ---- Mock Redis Client ----

const mockRedisStore: Record<string, { value: unknown; ttl?: number }> = {};

const mockRedisClient = {
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn(async (key: string) => {
    const entry = mockRedisStore[key];
    return entry ? entry.value : null;
  }),
  set: jest.fn(async (key: string, value: unknown, options?: { ex?: number }) => {
    mockRedisStore[key] = { value, ttl: options?.ex };
    return 'OK';
  }),
  del: jest.fn(async (key: string) => {
    delete mockRedisStore[key];
    return 1;
  }),
};

jest.mock('@upstash/redis', () => ({
  Redis: jest.fn().mockImplementation(() => mockRedisClient),
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock config
jest.mock('../../src/utils/config', () => ({
  config: {
    REDIS_URL: 'redis://test:6379',
    REDIS_TOKEN: 'test-token',
  },
}));

// Import after mocks
import {
  getSessionState,
  setSessionState,
  pushToHistory,
  getHistory,
  getCachedTTS,
  setCachedTTS,
  ttsCacheKey,
  bufferSSEEvent,
  getBufferedSSEEvents,
  clearSSEEventBuffer,
  isRedisAvailable,
} from '../../src/services/redis';

import type { ConversationEntry, BufferedSSEEvent } from '../../src/services/redis';
import type { GameState } from '../../../shared/types/index';

// ---- Tests ----

describe('Redis Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear mock store
    for (const key of Object.keys(mockRedisStore)) {
      delete mockRedisStore[key];
    }
  });

  // ================================================================
  // Session State CRUD
  // ================================================================

  describe('Session State CRUD', () => {
    const sessionId = 'test-session-001';
    const mockState = createMockGameState({ sessionId }) as unknown as GameState;

    it('should set session state', async () => {
      await setSessionState(sessionId, mockState);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `session:${sessionId}:state`,
        mockState,
        { ex: 7200 }, // 2 hour TTL
      );
    });

    it('should get session state', async () => {
      // Pre-populate store
      mockRedisStore[`session:${sessionId}:state`] = { value: mockState };

      const result = await getSessionState(sessionId);

      expect(result).toEqual(mockState);
      expect(mockRedisClient.get).toHaveBeenCalledWith(`session:${sessionId}:state`);
    });

    it('should return null for non-existent session state', async () => {
      const result = await getSessionState('nonexistent');

      expect(result).toBeNull();
    });

    it('should handle Redis get errors gracefully (return null)', async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await getSessionState(sessionId);

      expect(result).toBeNull();
    });

    it('should handle Redis set errors gracefully (no throw)', async () => {
      mockRedisClient.set.mockRejectedValueOnce(new Error('Connection refused'));

      // Should not throw
      await expect(setSessionState(sessionId, mockState)).resolves.toBeUndefined();
    });
  });

  // ================================================================
  // Conversation History
  // ================================================================

  describe('Conversation History', () => {
    const sessionId = 'test-session-002';

    it('should push an entry to history', async () => {
      const entry: ConversationEntry = {
        role: 'user',
        content: 'I open the door.',
        turnNumber: 1,
        timestamp: '2026-03-25T10:00:00Z',
      };

      await pushToHistory(sessionId, entry);

      expect(mockRedisClient.set).toHaveBeenCalled();
      const callArgs = mockRedisClient.set.mock.calls[0];
      expect(callArgs[0]).toBe(`session:${sessionId}:history`);

      const storedHistory = callArgs[1] as ConversationEntry[];
      expect(storedHistory).toHaveLength(1);
      expect(storedHistory[0]).toEqual(entry);
    });

    it('should get last N conversation entries', async () => {
      const entries: ConversationEntry[] = [];
      for (let i = 1; i <= 10; i++) {
        entries.push({
          role: i % 2 === 1 ? 'user' : 'assistant',
          content: `Message ${i}`,
          turnNumber: Math.ceil(i / 2),
          timestamp: `2026-03-25T10:0${i}:00Z`,
        });
      }

      mockRedisStore[`session:${sessionId}:history`] = { value: entries };

      const result = await getHistory(sessionId, 3);

      // limit=3 means last 3*2=6 messages
      expect(result).toHaveLength(6);
      expect(result[0].content).toBe('Message 5');
    });

    it('should return all entries when fewer than limit', async () => {
      const entries: ConversationEntry[] = [
        { role: 'user', content: 'Hello', turnNumber: 1, timestamp: '2026-01-01T00:00:00Z' },
        { role: 'assistant', content: 'Welcome!', turnNumber: 1, timestamp: '2026-01-01T00:00:01Z' },
      ];

      mockRedisStore[`session:${sessionId}:history`] = { value: entries };

      const result = await getHistory(sessionId, 15);

      expect(result).toHaveLength(2);
    });

    it('should trim history to maxEntries when pushing', async () => {
      // Pre-populate with 30 entries (maxEntries=15 means max 30 messages)
      const existing: ConversationEntry[] = [];
      for (let i = 1; i <= 30; i++) {
        existing.push({
          role: i % 2 === 1 ? 'user' : 'assistant',
          content: `Msg ${i}`,
          turnNumber: Math.ceil(i / 2),
          timestamp: new Date().toISOString(),
        });
      }
      mockRedisStore[`session:${sessionId}:history`] = { value: existing };

      // Push one more entry
      await pushToHistory(sessionId, {
        role: 'user',
        content: 'New message',
        turnNumber: 16,
        timestamp: new Date().toISOString(),
      });

      const callArgs = mockRedisClient.set.mock.calls[0];
      const storedHistory = callArgs[1] as ConversationEntry[];

      // Should be trimmed to 30 (15 * 2)
      expect(storedHistory).toHaveLength(30);
      // Newest entry should be last
      expect(storedHistory[storedHistory.length - 1].content).toBe('New message');
    });

    it('should return empty array for non-existent history', async () => {
      const result = await getHistory('nonexistent');
      expect(result).toEqual([]);
    });

    it('should handle Redis errors gracefully for history operations', async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error('Redis error'));

      const result = await getHistory(sessionId);
      expect(result).toEqual([]);
    });
  });

  // ================================================================
  // TTS Cache
  // ================================================================

  describe('TTS Cache', () => {
    it('should generate deterministic cache keys', () => {
      const key1 = ttsCacheKey('Hello world', 'alloy');
      const key2 = ttsCacheKey('Hello world', 'alloy');
      const key3 = ttsCacheKey('Hello world', 'echo');

      expect(key1).toBe(key2); // Same text + voice = same key
      expect(key1).not.toBe(key3); // Different voice = different key
    });

    it('should cache TTS audio', async () => {
      await setCachedTTS('Hello adventurer.', 'alloy', 'base64AudioData==');

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('tts:cache:'),
        'base64AudioData==',
        { ex: 86400 }, // 24 hour TTL
      );
    });

    it('should return cached TTS on cache hit', async () => {
      const key = ttsCacheKey('Hello adventurer.', 'alloy');
      mockRedisStore[key] = { value: 'cachedAudioBase64==' };

      const result = await getCachedTTS('Hello adventurer.', 'alloy');

      expect(result).toBe('cachedAudioBase64==');
    });

    it('should return null on cache miss', async () => {
      const result = await getCachedTTS('Uncached text.', 'alloy');

      expect(result).toBeNull();
    });

    it('should use correct key pattern (tts:cache:{hash})', () => {
      const key = ttsCacheKey('Test text', 'alloy');

      expect(key).toMatch(/^tts:cache:.+$/);
    });

    it('should handle Redis errors gracefully for TTS cache', async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error('Redis error'));

      const result = await getCachedTTS('Test', 'alloy');
      expect(result).toBeNull();
    });
  });

  // ================================================================
  // Key Patterns
  // ================================================================

  describe('Key patterns', () => {
    it('should use session:{id}:state for game state', async () => {
      const state = createMockGameState() as unknown as GameState;
      await setSessionState('abc-123', state);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'session:abc-123:state',
        expect.anything(),
        expect.anything(),
      );
    });

    it('should use session:{id}:history for conversation history', async () => {
      await pushToHistory('abc-123', {
        role: 'user',
        content: 'Test',
        turnNumber: 1,
        timestamp: new Date().toISOString(),
      });

      // getHistory calls get first, then set
      const getCall = mockRedisClient.get.mock.calls.find(
        (call: any[]) => call[0] === 'session:abc-123:history',
      );
      expect(getCall).toBeDefined();
    });

    it('should use session:{id}:events for SSE event buffer', async () => {
      await bufferSSEEvent('abc-123', {
        id: 1,
        type: 'turn_start',
        data: {},
        timestamp: Date.now(),
      });

      const getCall = mockRedisClient.get.mock.calls.find(
        (call: any[]) => call[0] === 'session:abc-123:events',
      );
      expect(getCall).toBeDefined();
    });

    it('should use tts:cache:{hash} for TTS cache', () => {
      const key = ttsCacheKey('Test', 'alloy');
      expect(key).toMatch(/^tts:cache:[A-Za-z0-9_-]+$/);
    });
  });

  // ================================================================
  // SSE Event Buffer
  // ================================================================

  describe('SSE Event Buffer', () => {
    const sessionId = 'test-session-003';

    it('should buffer an SSE event', async () => {
      const event: BufferedSSEEvent = {
        id: 1,
        type: 'turn_start',
        data: { sessionId },
        timestamp: Date.now(),
      };

      await bufferSSEEvent(sessionId, event);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `session:${sessionId}:events`,
        expect.arrayContaining([expect.objectContaining({ id: 1, type: 'turn_start' })]),
        { ex: 1800 }, // 30 min TTL
      );
    });

    it('should get buffered events after a given ID', async () => {
      const events: BufferedSSEEvent[] = [
        { id: 1, type: 'turn_start', data: {}, timestamp: 100 },
        { id: 2, type: 'transcription', data: {}, timestamp: 200 },
        { id: 3, type: 'narration_chunk', data: {}, timestamp: 300 },
      ];

      mockRedisStore[`session:${sessionId}:events`] = { value: events };

      const result = await getBufferedSSEEvents(sessionId, 1);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(3);
    });

    it('should trim buffer to 50 events', async () => {
      const existing: BufferedSSEEvent[] = [];
      for (let i = 1; i <= 50; i++) {
        existing.push({ id: i, type: 'narration_chunk', data: {}, timestamp: i * 100 });
      }
      mockRedisStore[`session:${sessionId}:events`] = { value: existing };

      await bufferSSEEvent(sessionId, {
        id: 51,
        type: 'turn_end',
        data: {},
        timestamp: 5100,
      });

      const callArgs = mockRedisClient.set.mock.calls[0];
      const storedEvents = callArgs[1] as BufferedSSEEvent[];

      expect(storedEvents).toHaveLength(50);
      expect(storedEvents[0].id).toBe(2); // Oldest trimmed
      expect(storedEvents[storedEvents.length - 1].id).toBe(51); // Newest added
    });

    it('should clear SSE event buffer', async () => {
      mockRedisStore[`session:${sessionId}:events`] = { value: [{ id: 1 }] };

      await clearSSEEventBuffer(sessionId);

      expect(mockRedisClient.del).toHaveBeenCalledWith(`session:${sessionId}:events`);
    });
  });

  // ================================================================
  // Concurrent Access
  // ================================================================

  describe('Concurrent access', () => {
    it('should handle multiple reads to same session without error', async () => {
      const sessionId = 'concurrent-session';
      const state = createMockGameState({ sessionId }) as unknown as GameState;
      mockRedisStore[`session:${sessionId}:state`] = { value: state };

      // Simulate concurrent reads
      const results = await Promise.all([
        getSessionState(sessionId),
        getSessionState(sessionId),
        getSessionState(sessionId),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((r) => {
        expect(r).toEqual(state);
      });
    });

    it('should handle multiple writes to same session', async () => {
      const sessionId = 'concurrent-write';

      const states = [1, 2, 3].map((i) =>
        createMockGameState({
          sessionId,
          session: {
            turnsPlayed: i,
            imagesGenerated: 0,
            timeElapsedMinutes: i * 5,
            lastSavedAt: new Date().toISOString(),
          },
        }),
      );

      // Simulate concurrent writes (last one wins)
      await Promise.all(
        states.map((s) => setSessionState(sessionId, s as unknown as GameState)),
      );

      expect(mockRedisClient.set).toHaveBeenCalledTimes(3);
    });
  });

  // ================================================================
  // Redis Availability
  // ================================================================

  describe('isRedisAvailable()', () => {
    it('should return true when Redis responds to ping', async () => {
      const available = await isRedisAvailable();
      expect(available).toBe(true);
    });

    it('should return false when Redis ping fails', async () => {
      mockRedisClient.ping.mockRejectedValueOnce(new Error('Connection refused'));

      const available = await isRedisAvailable();
      expect(available).toBe(false);
    });
  });
});
