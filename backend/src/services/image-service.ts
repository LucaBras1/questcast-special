/**
 * Image Generation Service.
 *
 * Handles scene image generation with caching and session limits.
 * - Assembles image prompt from scene description and art style
 * - Checks Redis cache (hash of sceneDescription + artStyle)
 * - Enforces max images per session (2 for free tier)
 * - Stores generated image URL in Redis with 7-day TTL
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAIService } from '../ai/index.js';
import { getRedis, isRedisAvailable } from './redis.js';
import { getGameState } from './game-service.js';
import { circuitBreakers } from '../utils/circuit-breaker.js';
import { trackImageGenerated } from './analytics.js';
import { logger } from '../utils/logger.js';
import { MAX_IMAGES_PER_SESSION } from '../../../shared/constants/index.js';

const IMAGE_CACHE_TTL = 604_800; // 7 days in seconds

// ---- Prompt Template ----

let _scenePromptTemplate: string | null = null;

function getScenePromptTemplate(): string {
  if (!_scenePromptTemplate) {
    try {
      const path = join(process.cwd(), '..', 'prompts', 'image_scene.txt');
      _scenePromptTemplate = readFileSync(path, 'utf-8');
    } catch {
      logger.error('Failed to load image_scene.txt prompt template');
      _scenePromptTemplate =
        'Fantasy RPG scene illustration. Scene: {scene_description}. Art style: {art_style}.';
    }
  }
  return _scenePromptTemplate;
}

// ---- Cache Key ----

function imageCacheKey(sceneDescription: string, artStyle: string): string {
  const hash = createHash('sha256')
    .update(`${sceneDescription}:${artStyle}`)
    .digest('hex')
    .slice(0, 32);
  return `image:cache:${hash}`;
}

// ---- Session Image Count ----

function imageCountKey(sessionId: string): string {
  return `session:${sessionId}:image_count`;
}

async function getSessionImageCount(sessionId: string): Promise<number> {
  if (!(await isRedisAvailable())) {
    // Fallback: check game state
    const gameState = await getGameState(sessionId);
    return gameState.session.imagesGenerated;
  }

  try {
    const redis = getRedis();
    const count = await redis.get<number>(imageCountKey(sessionId));
    return count ?? 0;
  } catch {
    const gameState = await getGameState(sessionId);
    return gameState.session.imagesGenerated;
  }
}

async function incrementSessionImageCount(sessionId: string): Promise<void> {
  if (await isRedisAvailable()) {
    try {
      const redis = getRedis();
      const key = imageCountKey(sessionId);
      const current = (await redis.get<number>(key)) ?? 0;
      await redis.set(key, current + 1, { ex: 7200 }); // 2 hour TTL matches session state
    } catch (error) {
      logger.error('Failed to increment image count in Redis', { sessionId, error });
    }
  }
}

// ---- Public API ----

export interface ImageGenerationResult {
  imageUrl: string;
  prompt: string;
  cached: boolean;
  cost: number;
}

/**
 * Assemble the full image generation prompt from scene description and art style.
 */
export function assembleImagePrompt(sceneDescription: string, artStyle: string): string {
  const template = getScenePromptTemplate();
  return template
    .replace('{scene_description}', sceneDescription)
    .replace('{art_style}', artStyle)
    .replace('{mood}', 'atmospheric'); // Default mood
}

/**
 * Generate a scene image with caching and session limits.
 *
 * @param sessionId - Game session ID
 * @param userId - User ID for analytics
 * @param sceneDescription - Description of the scene to illustrate
 * @param artStyle - Art style to use
 * @returns Image URL, prompt used, whether it was cached, and cost
 * @throws Error if session has reached image limit
 */
export async function generateSceneImage(
  sessionId: string,
  userId: string,
  sceneDescription: string,
  artStyle: string,
): Promise<ImageGenerationResult> {
  // Check session image limit
  const imageCount = await getSessionImageCount(sessionId);
  if (imageCount >= MAX_IMAGES_PER_SESSION) {
    throw new ImageLimitError(sessionId, imageCount);
  }

  const cacheKey = imageCacheKey(sceneDescription, artStyle);

  // Check cache
  if (await isRedisAvailable()) {
    try {
      const redis = getRedis();
      const cached = await redis.get<string>(cacheKey);
      if (cached) {
        logger.info('Image cache hit', { sessionId, cacheKey });
        trackImageGenerated(sessionId, userId, true, 0);
        return {
          imageUrl: cached,
          prompt: assembleImagePrompt(sceneDescription, artStyle),
          cached: true,
          cost: 0,
        };
      }
    } catch (error) {
      logger.warn('Image cache check failed', { error });
    }
  }

  // Generate image through circuit breaker
  const prompt = assembleImagePrompt(sceneDescription, artStyle);
  const breaker = circuitBreakers.image();

  const result = await breaker.execute(async () => {
    const aiService = getAIService();
    return aiService.generateImage(prompt, artStyle);
  });

  // Cache the result
  if (await isRedisAvailable()) {
    try {
      const redis = getRedis();
      await redis.set(cacheKey, result.imageUrl, { ex: IMAGE_CACHE_TTL });
    } catch (error) {
      logger.warn('Failed to cache image URL', { error });
    }
  }

  // Increment session image count
  await incrementSessionImageCount(sessionId);

  // Track analytics
  trackImageGenerated(sessionId, userId, false, result.cost.imageCost);

  logger.info('Image generated', {
    sessionId,
    cost: result.cost.imageCost,
    imageCount: imageCount + 1,
    maxImages: MAX_IMAGES_PER_SESSION,
  });

  return {
    imageUrl: result.imageUrl,
    prompt,
    cached: false,
    cost: result.cost.imageCost,
  };
}

// ---- Error Class ----

export class ImageLimitError extends Error {
  public readonly sessionId: string;
  public readonly currentCount: number;

  constructor(sessionId: string, currentCount: number) {
    super(`Session ${sessionId} has reached the image generation limit (${currentCount}/${MAX_IMAGES_PER_SESSION})`);
    this.name = 'ImageLimitError';
    this.sessionId = sessionId;
    this.currentCount = currentCount;
  }
}
