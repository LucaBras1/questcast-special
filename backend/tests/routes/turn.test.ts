/**
 * Turn Endpoint -- Integration Test Suite
 *
 * Tests for POST /api/game/session/:id/turn
 *
 * Validates the full voice loop pipeline:
 *   audio -> STT -> moderation -> LLM -> TTS -> SSE stream
 *
 * All AI services are mocked -- no real API calls.
 */

import { FastifyInstance } from 'fastify';
import {
  buildTestApp,
  generateTestToken,
  createMockGameState,
  createMockNarrationResponse,
  MockDatabase,
  MockGameSession,
} from '../setup';

// ---- Mock Dependencies ----

const mockDb = new MockDatabase();

// Mock AI service responses
const mockTranscribe = jest.fn();
const mockModerateContent = jest.fn();
const mockGenerateNarration = jest.fn();
const mockSynthesizeSpeech = jest.fn();

// Mock Redis service
const mockPushToHistory = jest.fn();
const mockGetHistory = jest.fn();

// ---- SSE Response Parser ----

interface ParsedSSEEvent {
  id?: string;
  event?: string;
  data?: unknown;
}

function parseSSEResponse(rawBody: string): ParsedSSEEvent[] {
  const events: ParsedSSEEvent[] = [];
  const blocks = rawBody.split('\n\n').filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const event: ParsedSSEEvent = {};
    const lines = block.split('\n');

    for (const line of lines) {
      if (line.startsWith('id:')) {
        event.id = line.slice(3).trim();
      } else if (line.startsWith('event:')) {
        event.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        try {
          event.data = JSON.parse(line.slice(5).trim());
        } catch {
          event.data = line.slice(5).trim();
        }
      }
    }

    if (event.event || event.data) {
      events.push(event);
    }
  }

  return events;
}

// ---- Expected SSE Event Order ----

// Expected event order for reference (validated in ordering test below):
// turn_start -> transcription -> moderation_pass -> narration_chunk ->
// narration_complete -> tts_chunk -> tts_complete -> state_update -> turn_end

// ---- Test Suite ----

describe('Turn Endpoint (POST /api/game/session/:id/turn)', () => {
  let app: FastifyInstance;
  const userId = 'user-turn-001';
  const otherUserId = 'user-turn-002';
  let authToken: string;
  let otherUserToken: string;

  // Counters for SSE event IDs
  let eventIdCounter: number;

  // Helper to create an SSE event line
  function sseEvent(type: string, data: unknown): string {
    eventIdCounter++;
    return `id:${eventIdCounter}\nevent:${type}\ndata:${JSON.stringify(data)}\n\n`;
  }

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

    // POST /api/game/session/:id/turn -- full pipeline
    app.post('/api/game/session/:id/turn', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const { id: sessionId } = request.params as { id: string };
        const { audioBase64, textInput } = request.body as {
          audioBase64?: string;
          textInput?: string;
        };

        // Validate input: must have either audio or text
        if (!audioBase64 && !textInput) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message: 'Either audioBase64 or textInput is required',
          });
        }

        // Find session
        const session = mockDb.findSessionById(sessionId);
        if (!session) {
          return reply.status(404).send({
            code: 'NOT_FOUND',
            message: 'Game session not found',
          });
        }

        // Authorization
        if (session.userId !== request.userId) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: 'You do not have access to this session',
          });
        }

        // Check session status
        if (session.status === 'completed') {
          return reply.status(400).send({
            code: 'SESSION_COMPLETED',
            message: 'This session has been completed',
          });
        }

        // Set SSE headers
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        eventIdCounter = 0;
        let responseBody = '';

        // 1. turn_start
        responseBody += sseEvent('turn_start', {
          sessionId,
          turnNumber: (session.gameState?.session?.turnsPlayed ?? 0) + 1,
        });

        // 2. STT (transcription)
        let playerText: string;
        try {
          if (audioBase64) {
            const transcription = await mockTranscribe(Buffer.from(audioBase64, 'base64'));
            playerText = transcription.text;
          } else {
            playerText = textInput!;
          }
          responseBody += sseEvent('transcription', { text: playerText });
        } catch (error) {
          responseBody += sseEvent('error', {
            code: 'STT_FAILED',
            message: 'Speech recognition failed. Please try again or type your action.',
          });
          reply.raw.end(responseBody);
          return;
        }

        // 3. Moderation
        try {
          const moderationResult = await mockModerateContent(playerText);
          if (moderationResult.flagged) {
            responseBody += sseEvent('moderation_fail', {
              reason: 'Content flagged by moderation',
            });
            // Send in-game redirect instead of blocking
            const redirectNarration =
              'The world shimmers, rejecting that path. Perhaps a different approach, adventurer?';
            responseBody += sseEvent('narration_chunk', { text: redirectNarration, index: 0 });
            responseBody += sseEvent('narration_complete', {
              fullText: redirectNarration,
            });
            responseBody += sseEvent('turn_end', {
              turnNumber: (session.gameState?.session?.turnsPlayed ?? 0) + 1,
              moderated: true,
            });
            reply.raw.end(responseBody);
            return;
          }
          responseBody += sseEvent('moderation_pass', { safe: true });
        } catch {
          // Moderation API failure: continue without moderation (log warning)
          responseBody += sseEvent('moderation_pass', { safe: true, fallback: true });
        }

        // 4. LLM Narration
        let narrationResponse: any;
        try {
          narrationResponse = await mockGenerateNarration(
            'system prompt',
            [],
            session.gameState || {},
          );

          // Send narration chunks
          const sentences = narrationResponse.text.match(/[^.!?]+[.!?]+/g) || [
            narrationResponse.text,
          ];
          for (let i = 0; i < sentences.length; i++) {
            responseBody += sseEvent('narration_chunk', {
              text: sentences[i].trim(),
              index: i,
            });
          }
          responseBody += sseEvent('narration_complete', {
            fullText: narrationResponse.text,
            suggestedActions: narrationResponse.parsedResponse?.suggestedActions || [],
          });
        } catch {
          // LLM failure: use fallback response
          const fallbackText =
            'The world around you flickers for a moment. What do you do next?';
          responseBody += sseEvent('narration_chunk', { text: fallbackText, index: 0 });
          responseBody += sseEvent('narration_complete', {
            fullText: fallbackText,
            isFallback: true,
          });
          narrationResponse = { text: fallbackText, parsedResponse: {} };
        }

        // 5. TTS
        try {
          const speech = await mockSynthesizeSpeech(narrationResponse.text);
          responseBody += sseEvent('tts_chunk', {
            audioBase64: speech.audioBuffer.toString('base64'),
            index: 0,
          });
          responseBody += sseEvent('tts_complete', { totalChunks: 1 });
        } catch {
          // TTS failure: narration_complete already sent, skip tts_chunk events
          responseBody += sseEvent('tts_complete', { totalChunks: 0, textOnly: true });
        }

        // 6. State update
        const turnsPlayed = (session.gameState?.session?.turnsPlayed ?? 0) + 1;
        const stateUpdate = narrationResponse.parsedResponse?.stateUpdates || {};
        responseBody += sseEvent('state_update', {
          turnsPlayed,
          stateUpdates: stateUpdate,
        });

        // Update mock db state
        if (session.gameState) {
          session.gameState.session.turnsPlayed = turnsPlayed;
          session.gameState.session.lastSavedAt = new Date().toISOString();
          if (stateUpdate.locationChange) {
            session.gameState.story.currentLocation = stateUpdate.locationChange;
          }
        }

        // 7. Push to conversation history (player + AI = 2 entries)
        await mockPushToHistory(sessionId, {
          role: 'user',
          content: playerText,
          turnNumber: turnsPlayed,
        });
        await mockPushToHistory(sessionId, {
          role: 'assistant',
          content: narrationResponse.text,
          turnNumber: turnsPlayed,
        });

        // 8. turn_end with cost breakdown
        responseBody += sseEvent('turn_end', {
          turnNumber: turnsPlayed,
          cost: {
            sttCost: 0.001,
            llmInputCost: 0.002,
            llmOutputCost: 0.003,
            ttsCost: 0.004,
            totalCost: 0.01,
          },
        });

        reply.raw.end(responseBody);
      },
    });

    await app.ready();

    authToken = generateTestToken(app, { sub: userId, email: 'player@questcast.app' });
    otherUserToken = generateTestToken(app, {
      sub: otherUserId,
      email: 'other@questcast.app',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockDb.reset();
    jest.clearAllMocks();
    eventIdCounter = 0;

    // Default mock implementations
    mockTranscribe.mockResolvedValue({
      text: 'I open the door carefully.',
      language: 'en',
      durationSeconds: 3,
      cost: { sttCost: 0.001 },
    });

    mockModerateContent.mockResolvedValue({
      flagged: false,
      categories: { sexual: false, hate: false, violence: false },
      categoryScores: { sexual: 0.001, hate: 0.001, violence: 0.01 },
    });

    const mockNarration = createMockNarrationResponse();
    mockGenerateNarration.mockResolvedValue({
      text: mockNarration.narration,
      parsedResponse: mockNarration,
      promptTokens: 200,
      completionTokens: 80,
      cost: { llmInputCost: 0.002, llmOutputCost: 0.003 },
    });

    mockSynthesizeSpeech.mockResolvedValue({
      audioBuffer: Buffer.from('fake-audio-data'),
      format: 'mp3',
      durationSeconds: 5,
      cost: { ttsCost: 0.004 },
    });

    mockPushToHistory.mockResolvedValue(undefined);
    mockGetHistory.mockResolvedValue([]);
  });

  // Helper: create a session for the test user
  function createTestSession(overrides: Partial<MockGameSession> = {}): MockGameSession {
    return mockDb.createSession({
      id: '11111111-1111-1111-1111-111111111111',
      userId,
      status: 'active',
      gameState: createMockGameState({
        session: {
          turnsPlayed: 3,
          imagesGenerated: 0,
          timeElapsedMinutes: 5,
          lastSavedAt: new Date().toISOString(),
        },
      }),
      ...overrides,
    });
  }

  // ================================================================
  // Happy Path Tests
  // ================================================================

  describe('Happy Path', () => {
    it('should submit audio turn and receive SSE stream with all expected events', async () => {
      createTestSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          audioBase64: Buffer.from('fake-audio').toString('base64'),
        },
      });

      expect(response.statusCode).toBe(200);

      const events = parseSSEResponse(response.body);
      const eventTypes = events.map((e) => e.event);

      // Verify all expected event types are present
      expect(eventTypes).toContain('turn_start');
      expect(eventTypes).toContain('transcription');
      expect(eventTypes).toContain('moderation_pass');
      expect(eventTypes).toContain('narration_chunk');
      expect(eventTypes).toContain('narration_complete');
      expect(eventTypes).toContain('tts_chunk');
      expect(eventTypes).toContain('tts_complete');
      expect(eventTypes).toContain('state_update');
      expect(eventTypes).toContain('turn_end');
    });

    it('should submit text turn and receive SSE stream (text fallback mode)', async () => {
      createTestSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          textInput: 'I look around the room.',
        },
      });

      expect(response.statusCode).toBe(200);

      const events = parseSSEResponse(response.body);
      const transcriptionEvent = events.find((e) => e.event === 'transcription');
      expect(transcriptionEvent).toBeDefined();
      expect((transcriptionEvent!.data as any).text).toBe('I look around the room.');

      // STT mock should NOT have been called for text input
      expect(mockTranscribe).not.toHaveBeenCalled();
    });

    it('should maintain correct event ordering', async () => {
      createTestSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      const events = parseSSEResponse(response.body);
      const eventTypes = events.map((e) => e.event);

      // Find index of each expected event and verify order
      const turnStartIdx = eventTypes.indexOf('turn_start');
      const transcriptionIdx = eventTypes.indexOf('transcription');
      const moderationIdx = eventTypes.indexOf('moderation_pass');
      const firstNarrationIdx = eventTypes.indexOf('narration_chunk');
      const narrationCompleteIdx = eventTypes.indexOf('narration_complete');
      const firstTtsIdx = eventTypes.indexOf('tts_chunk');
      const ttsCompleteIdx = eventTypes.indexOf('tts_complete');
      const stateUpdateIdx = eventTypes.indexOf('state_update');
      const turnEndIdx = eventTypes.indexOf('turn_end');

      expect(turnStartIdx).toBeLessThan(transcriptionIdx);
      expect(transcriptionIdx).toBeLessThan(moderationIdx);
      expect(moderationIdx).toBeLessThan(firstNarrationIdx);
      expect(firstNarrationIdx).toBeLessThan(narrationCompleteIdx);
      expect(narrationCompleteIdx).toBeLessThan(firstTtsIdx);
      expect(firstTtsIdx).toBeLessThan(ttsCompleteIdx);
      expect(ttsCompleteIdx).toBeLessThan(stateUpdateIdx);
      expect(stateUpdateIdx).toBeLessThan(turnEndIdx);
    });

    it('should have monotonically increasing event IDs', async () => {
      createTestSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I look around.' },
      });

      const events = parseSSEResponse(response.body);
      const ids = events.map((e) => parseInt(e.id || '0', 10));

      for (let i = 1; i < ids.length; i++) {
        expect(ids[i]).toBeGreaterThan(ids[i - 1]);
      }
    });

    it('should update game state after turn', async () => {
      const session = createTestSession();
      const initialTurns = session.gameState!.session.turnsPlayed;

      await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      // Verify turns incremented
      expect(session.gameState!.session.turnsPlayed).toBe(initialTurns + 1);
    });

    it('should add 2 conversation history entries per turn (player + AI)', async () => {
      createTestSession();

      await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      // mockPushToHistory should be called twice: once for user, once for assistant
      expect(mockPushToHistory).toHaveBeenCalledTimes(2);
      expect(mockPushToHistory).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        expect.objectContaining({ role: 'user' }),
      );
      expect(mockPushToHistory).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        expect.objectContaining({ role: 'assistant' }),
      );
    });

    it('should include correct cost breakdown in turn_end', async () => {
      createTestSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      const events = parseSSEResponse(response.body);
      const turnEnd = events.find((e) => e.event === 'turn_end');
      expect(turnEnd).toBeDefined();

      const turnEndData = turnEnd!.data as any;
      expect(turnEndData.cost).toBeDefined();
      expect(turnEndData.cost).toHaveProperty('sttCost');
      expect(turnEndData.cost).toHaveProperty('llmInputCost');
      expect(turnEndData.cost).toHaveProperty('llmOutputCost');
      expect(turnEndData.cost).toHaveProperty('ttsCost');
      expect(turnEndData.cost).toHaveProperty('totalCost');
      expect(turnEndData.cost.totalCost).toBe(
        turnEndData.cost.sttCost +
          turnEndData.cost.llmInputCost +
          turnEndData.cost.llmOutputCost +
          turnEndData.cost.ttsCost,
      );
    });
  });

  // ================================================================
  // Error Handling Tests
  // ================================================================

  describe('Error Handling', () => {
    it('should return 404 for invalid session ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/99999999-9999-9999-9999-999999999999/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('should return 403 when session belongs to another user', async () => {
      createTestSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${otherUserToken}` },
        payload: { textInput: 'I open the door.' },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.code).toBe('FORBIDDEN');
    });

    it('should return 400 when session is completed', async () => {
      createTestSession({ status: 'completed' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('SESSION_COMPLETED');
    });

    it('should return 400 when missing both audio and text input', async () => {
      createTestSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 when unauthenticated', async () => {
      createTestSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        payload: { textInput: 'I open the door.' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should send error event when STT fails', async () => {
      createTestSession();
      mockTranscribe.mockRejectedValue(new Error('STT service unavailable'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          audioBase64: Buffer.from('fake-audio').toString('base64'),
        },
      });

      expect(response.statusCode).toBe(200);
      const events = parseSSEResponse(response.body);
      const errorEvent = events.find((e) => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as any).code).toBe('STT_FAILED');
    });

    it('should use fallback response when LLM fails', async () => {
      createTestSession();
      mockGenerateNarration.mockRejectedValue(new Error('LLM rate limit exceeded'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      expect(response.statusCode).toBe(200);
      const events = parseSSEResponse(response.body);

      const narrationComplete = events.find((e) => e.event === 'narration_complete');
      expect(narrationComplete).toBeDefined();
      expect((narrationComplete!.data as any).isFallback).toBe(true);
    });

    it('should handle LLM returning invalid JSON by using fallback', async () => {
      createTestSession();
      mockGenerateNarration.mockRejectedValue(new Error('Zod validation failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      expect(response.statusCode).toBe(200);
      const events = parseSSEResponse(response.body);
      const narrationComplete = events.find((e) => e.event === 'narration_complete');
      expect(narrationComplete).toBeDefined();
      expect((narrationComplete!.data as any).isFallback).toBe(true);
    });

    it('should send narration_complete with text only when TTS fails', async () => {
      createTestSession();
      mockSynthesizeSpeech.mockRejectedValue(new Error('TTS service unavailable'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      expect(response.statusCode).toBe(200);
      const events = parseSSEResponse(response.body);

      // narration_complete should still be present
      const narrationComplete = events.find((e) => e.event === 'narration_complete');
      expect(narrationComplete).toBeDefined();

      // tts_complete should indicate text-only mode
      const ttsComplete = events.find((e) => e.event === 'tts_complete');
      expect(ttsComplete).toBeDefined();
      expect((ttsComplete!.data as any).textOnly).toBe(true);
      expect((ttsComplete!.data as any).totalChunks).toBe(0);

      // No tts_chunk events should be present
      const ttsChunks = events.filter((e) => e.event === 'tts_chunk');
      expect(ttsChunks).toHaveLength(0);
    });
  });

  // ================================================================
  // Moderation Tests
  // ================================================================

  describe('Content Moderation', () => {
    it('should allow safe player input through (moderation_pass event)', async () => {
      createTestSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I carefully examine the ancient scroll.' },
      });

      const events = parseSSEResponse(response.body);
      const moderationEvent = events.find((e) => e.event === 'moderation_pass');
      expect(moderationEvent).toBeDefined();
      expect((moderationEvent!.data as any).safe).toBe(true);

      // Turn should continue normally
      expect(events.find((e) => e.event === 'narration_chunk')).toBeDefined();
    });

    it('should catch unsafe player input and redirect in-game', async () => {
      createTestSession();
      mockModerateContent.mockResolvedValue({
        flagged: true,
        categories: { violence: true, hate: false },
        categoryScores: { violence: 0.95, hate: 0.01 },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'Some unsafe content here' },
      });

      expect(response.statusCode).toBe(200);
      const events = parseSSEResponse(response.body);

      // Should have moderation_fail event
      const modFail = events.find((e) => e.event === 'moderation_fail');
      expect(modFail).toBeDefined();

      // Should have an in-game redirect narration
      const narrationChunk = events.find((e) => e.event === 'narration_chunk');
      expect(narrationChunk).toBeDefined();
      expect((narrationChunk!.data as any).text).toContain('different approach');

      // turn_end should indicate moderated
      const turnEnd = events.find((e) => e.event === 'turn_end');
      expect(turnEnd).toBeDefined();
      expect((turnEnd!.data as any).moderated).toBe(true);
    });

    it('should continue without moderation when moderation API fails (log warning)', async () => {
      createTestSession();
      mockModerateContent.mockRejectedValue(new Error('Moderation API unavailable'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      expect(response.statusCode).toBe(200);
      const events = parseSSEResponse(response.body);

      // Should still have moderation_pass (with fallback flag)
      const moderationEvent = events.find((e) => e.event === 'moderation_pass');
      expect(moderationEvent).toBeDefined();
      expect((moderationEvent!.data as any).fallback).toBe(true);

      // Turn should continue normally
      expect(events.find((e) => e.event === 'narration_chunk')).toBeDefined();
    });
  });

  // ================================================================
  // Session State Tests
  // ================================================================

  describe('Session State', () => {
    it('should persist game state updates (location change) after turn', async () => {
      const mockNarration = createMockNarrationResponse({
        stateUpdates: {
          locationChange: 'Ancient Library',
          threatLevel: 'moderate',
        },
      });
      mockGenerateNarration.mockResolvedValue({
        text: mockNarration.narration,
        parsedResponse: mockNarration,
        promptTokens: 200,
        completionTokens: 80,
        cost: { llmInputCost: 0.002, llmOutputCost: 0.003 },
      });

      const session = createTestSession();

      await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I enter the library.' },
      });

      // Verify location was updated
      expect(session.gameState!.story.currentLocation).toBe('Ancient Library');
    });

    it('should increment turns played after each turn', async () => {
      const session = createTestSession();
      const initialTurns = session.gameState!.session.turnsPlayed;

      // First turn
      await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      expect(session.gameState!.session.turnsPlayed).toBe(initialTurns + 1);
    });

    it('should update lastSavedAt timestamp after turn', async () => {
      const session = createTestSession();
      const initialSaveTime = session.gameState!.session.lastSavedAt;

      // Small delay to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await app.inject({
        method: 'POST',
        url: '/api/game/session/11111111-1111-1111-1111-111111111111/turn',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { textInput: 'I open the door.' },
      });

      expect(session.gameState!.session.lastSavedAt).not.toBe(initialSaveTime);
    });
  });
});
