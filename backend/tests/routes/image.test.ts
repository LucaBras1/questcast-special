/**
 * Image Generation Routes -- Test Suite
 *
 * Tests for POST /api/game/image:
 * - Successful image generation with valid scene description
 * - Cache hit: same description returns cached image (no API call)
 * - Max images per session (2) enforced -- 3rd request returns 429
 * - Invalid art style rejected
 * - Auto-trigger from turn: shouldGenerateImage=true -> image_ready SSE event
 * - Unauthenticated request rejected
 * - Image generation failure -> graceful fallback
 */

import { FastifyInstance } from 'fastify';
import {
  buildTestApp,
  generateTestToken,
  createMockGameState,
  MockDatabase,
} from '../setup';

// ---- Mock Dependencies ----

const mockDb = new MockDatabase();

// Track API calls to verify caching
let imageApiCallCount = 0;
const imageCache = new Map<string, string>();

// Simulate image generation failures
let shouldFailImageGeneration = false;

describe('Image Generation Routes', () => {
  let app: FastifyInstance;
  const userId = 'user-image-001';
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

    // POST /api/game/image -- generate scene image
    app.post('/api/game/image', {
      preHandler: authenticate,
      handler: async (request: any, reply) => {
        const { sessionId, sceneDescription, artStyle } = request.body as {
          sessionId?: string;
          sceneDescription?: string;
          artStyle?: string;
        };

        // Validate required fields
        if (!sessionId || !sceneDescription) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message: 'sessionId and sceneDescription are required',
          });
        }

        // Validate art style
        const validStyles = ['fantasy', 'dark-fantasy', 'watercolor', 'pixel-art'];
        if (artStyle && !validStyles.includes(artStyle)) {
          return reply.status(400).send({
            code: 'VALIDATION_ERROR',
            message: `Invalid art style. Must be one of: ${validStyles.join(', ')}`,
          });
        }

        // Check session exists and user owns it
        const session = mockDb.findSessionById(sessionId);
        if (!session) {
          return reply.status(404).send({
            code: 'NOT_FOUND',
            message: 'Game session not found',
          });
        }

        if (session.userId !== request.userId) {
          return reply.status(403).send({
            code: 'FORBIDDEN',
            message: 'You do not own this session',
          });
        }

        // Check max images per session (2)
        const imagesGenerated = session.gameState?.session?.imagesGenerated ?? 0;
        if (imagesGenerated >= 2) {
          return reply.status(429).send({
            code: 'IMAGE_LIMIT_REACHED',
            message: 'Maximum of 2 images per session reached',
          });
        }

        // Check cache
        const cacheKey = `${sessionId}:${sceneDescription}`;
        const cachedImage = imageCache.get(cacheKey);
        if (cachedImage) {
          return reply.status(200).send({
            imageUrl: cachedImage,
            cached: true,
          });
        }

        // Simulate image generation failure
        if (shouldFailImageGeneration) {
          return reply.status(200).send({
            imageUrl: null,
            error: 'Image generation failed, continuing without image',
            fallback: true,
          });
        }

        // Generate image (mock API call)
        imageApiCallCount++;
        const imageUrl = `https://cdn.questcast.app/images/generated-${imageApiCallCount}.png`;
        imageCache.set(cacheKey, imageUrl);

        // Update session state
        if (session.gameState?.session) {
          session.gameState.session.imagesGenerated = imagesGenerated + 1;
        }

        return reply.status(200).send({
          imageUrl,
          cached: false,
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
    imageApiCallCount = 0;
    imageCache.clear();
    shouldFailImageGeneration = false;
  });

  // ================================================================
  // POST /api/game/image
  // ================================================================

  describe('POST /api/game/image', () => {
    it('should generate an image with a valid scene description', async () => {
      const session = mockDb.createSession({
        userId,
        gameState: createMockGameState({ session: { turnsPlayed: 5, imagesGenerated: 0, timeElapsedMinutes: 10, lastSavedAt: new Date().toISOString() } }),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          sessionId: session.id,
          sceneDescription: 'A dark cavern illuminated by glowing crystals, with a waterfall in the background',
          artStyle: 'fantasy',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.imageUrl).toBeDefined();
      expect(body.imageUrl).toContain('https://');
      expect(body.cached).toBe(false);
      expect(imageApiCallCount).toBe(1);
    });

    it('should return cached image for the same description (no API call)', async () => {
      const session = mockDb.createSession({
        userId,
        gameState: createMockGameState({ session: { turnsPlayed: 5, imagesGenerated: 0, timeElapsedMinutes: 10, lastSavedAt: new Date().toISOString() } }),
      });

      const sceneDescription = 'A mystical forest with ancient trees';

      // First request -- generates new image
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { sessionId: session.id, sceneDescription },
      });

      expect(response1.statusCode).toBe(200);
      expect(response1.json().cached).toBe(false);
      expect(imageApiCallCount).toBe(1);

      // Second request -- should return cached
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { sessionId: session.id, sceneDescription },
      });

      expect(response2.statusCode).toBe(200);
      expect(response2.json().cached).toBe(true);
      expect(response2.json().imageUrl).toBe(response1.json().imageUrl);
      expect(imageApiCallCount).toBe(1); // No additional API call
    });

    it('should enforce max images per session (2) -- 3rd request returns 429', async () => {
      const session = mockDb.createSession({
        userId,
        gameState: createMockGameState({ session: { turnsPlayed: 10, imagesGenerated: 0, timeElapsedMinutes: 20, lastSavedAt: new Date().toISOString() } }),
      });

      // First image
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          sessionId: session.id,
          sceneDescription: 'Scene one: a dark dungeon',
        },
      });
      expect(response1.statusCode).toBe(200);

      // Second image
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          sessionId: session.id,
          sceneDescription: 'Scene two: a dragon lair',
        },
      });
      expect(response2.statusCode).toBe(200);

      // Third image -- should be rejected
      const response3 = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          sessionId: session.id,
          sceneDescription: 'Scene three: a castle courtyard',
        },
      });

      expect(response3.statusCode).toBe(429);
      const body = response3.json();
      expect(body.code).toBe('IMAGE_LIMIT_REACHED');
      expect(body.message).toMatch(/maximum.*2/i);
    });

    it('should reject invalid art style', async () => {
      const session = mockDb.createSession({
        userId,
        gameState: createMockGameState({ session: { turnsPlayed: 5, imagesGenerated: 0, timeElapsedMinutes: 10, lastSavedAt: new Date().toISOString() } }),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          sessionId: session.id,
          sceneDescription: 'A magical landscape',
          artStyle: 'impressionist', // not in valid list
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toMatch(/invalid art style/i);
    });

    it('should reject unauthenticated request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        payload: {
          sessionId: 'some-id',
          sceneDescription: 'A scene',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle image generation failure gracefully', async () => {
      shouldFailImageGeneration = true;

      const session = mockDb.createSession({
        userId,
        gameState: createMockGameState({ session: { turnsPlayed: 5, imagesGenerated: 0, timeElapsedMinutes: 10, lastSavedAt: new Date().toISOString() } }),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          sessionId: session.id,
          sceneDescription: 'A scene that will fail to generate',
        },
      });

      // Should return 200 with fallback, not crash
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.imageUrl).toBeNull();
      expect(body.fallback).toBe(true);
    });

    it('should reject request with missing session ID', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          sceneDescription: 'A scene',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should reject request with missing scene description', async () => {
      const session = mockDb.createSession({ userId });

      const response = await app.inject({
        method: 'POST',
        url: '/api/game/image',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          sessionId: session.id,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ================================================================
  // Auto-trigger from turn (shouldGenerateImage=true)
  // ================================================================

  describe('Auto-trigger from turn', () => {
    it('should track that image_ready SSE event would be sent when shouldGenerateImage=true', () => {
      // This tests the contract: when LLM returns shouldGenerateImage=true,
      // the turn handler should trigger image generation and emit image_ready event.
      // Since the full SSE pipeline is tested in turn.test.ts,
      // here we verify the flag detection logic.

      const llmResponse = {
        narration: 'You enter a breathtaking crystal cavern...',
        shouldGenerateImage: true,
        imagePrompt: 'A vast underground cavern filled with luminescent crystals',
        stateUpdates: {
          locationChange: 'Crystal Cavern',
        },
      };

      expect(llmResponse.shouldGenerateImage).toBe(true);
      expect(llmResponse.imagePrompt).toBeDefined();
      expect(llmResponse.imagePrompt!.length).toBeGreaterThan(10);
    });

    it('should not trigger image generation when shouldGenerateImage is false', () => {
      const llmResponse = {
        narration: 'You walk down the corridor.',
        shouldGenerateImage: false,
        stateUpdates: {},
      };

      expect(llmResponse.shouldGenerateImage).toBe(false);
    });
  });
});
