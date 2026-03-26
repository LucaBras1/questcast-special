import { getAIService } from '../ai/index.js';
import { getCachedTTS, setCachedTTS } from './redis.js';
import { logger } from '../utils/logger.js';
import { recordTTSCacheHit, recordTTSCacheMiss } from './analytics.js';

/**
 * TTS Caching Service.
 *
 * Wraps TTS synthesis with Redis caching.
 * - Hash input text + voice -> check Redis cache
 * - If cache hit, return cached audio as base64
 * - If miss, call AI service TTS, cache the result, return it
 *
 * Audio is stored as base64 in Redis (suitable for small TTS segments).
 * For production, consider S3/R2 + URL caching instead.
 */

export interface TTSResult {
  audioBase64: string;
  format: string;
  durationSeconds: number;
  cost: number;
  cached: boolean;
}

/**
 * Synthesize text to speech with caching.
 */
export async function synthesizeWithCache(
  text: string,
  voice: string = 'alloy',
): Promise<TTSResult> {
  // Check cache first
  const cached = await getCachedTTS(text, voice);
  if (cached) {
    logger.debug('TTS cache hit', { textLength: text.length, voice });
    recordTTSCacheHit(text.length);
    return {
      audioBase64: cached,
      format: 'opus',
      durationSeconds: 0, // Unknown from cache; client should compute from audio
      cost: 0,
      cached: true,
    };
  }

  // Cache miss -- synthesize
  const aiService = getAIService();
  const result = await aiService.synthesizeSpeech(text, voice);

  const audioBase64 = result.audioBuffer.toString('base64');
  recordTTSCacheMiss(text.length, result.cost.ttsCost);

  // Store in cache (fire and forget)
  setCachedTTS(text, voice, audioBase64).catch((err) => {
    logger.error('Failed to cache TTS result', { error: err });
  });

  return {
    audioBase64,
    format: result.format,
    durationSeconds: result.durationSeconds,
    cost: result.cost.ttsCost,
    cached: false,
  };
}

/**
 * Pre-cache common fallback phrases at startup.
 * Reads from fallback_responses.json and generates TTS for each.
 * This is fire-and-forget -- failures are logged but don't block startup.
 */
export async function preCacheFallbackPhrases(
  fallbackResponses: Record<string, Record<string, string[]>>,
  voice: string = 'alloy',
): Promise<void> {
  const languages = ['en']; // Start with English; add 'cs' when Czech voice is configured
  let cached = 0;
  let total = 0;

  for (const lang of languages) {
    const categories = fallbackResponses[lang];
    if (!categories) continue;

    for (const [category, phrases] of Object.entries(categories)) {
      for (const phrase of phrases) {
        total++;
        try {
          // Check if already cached
          const existing = await getCachedTTS(phrase, voice);
          if (existing) {
            cached++;
            continue;
          }

          // Generate and cache
          await synthesizeWithCache(phrase, voice);
          cached++;
          logger.debug('Pre-cached fallback phrase', { lang, category });
        } catch (error) {
          logger.warn('Failed to pre-cache fallback phrase', {
            lang,
            category,
            error,
          });
        }
      }
    }
  }

  logger.info('Fallback phrase pre-caching complete', { cached, total });
}
