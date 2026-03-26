import { getAIService } from '../ai/index.js';
import { logger } from '../utils/logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Content Moderation Middleware.
 *
 * Calls OpenAI Moderation API on player text BEFORE it reaches the LLM.
 * If flagged:
 *   - Returns an in-game redirect response from fallback_responses.json
 *   - Logs the moderation event for monitoring
 *
 * This is a P0 requirement per the Devil's Advocate review.
 */

// ---- Fallback Responses (loaded once) ----

interface FallbackResponses {
  cs: Record<string, string[]>;
  en: Record<string, string[]>;
}

let _fallbackResponses: FallbackResponses | null = null;
let _lastUsedIndex: Map<string, number> = new Map();

function loadFallbackResponses(): FallbackResponses {
  if (!_fallbackResponses) {
    try {
      const path = join(process.cwd(), '..', 'prompts', 'fallback_responses.json');
      const raw = readFileSync(path, 'utf-8');
      _fallbackResponses = JSON.parse(raw) as FallbackResponses;
    } catch (error) {
      logger.error('Failed to load fallback_responses.json', error);
      _fallbackResponses = {
        cs: { generic_continue: ['Pokracujte ve svem dobrodruzstvi.'] },
        en: { generic_continue: ['Continue your adventure.'] },
      };
    }
  }
  return _fallbackResponses;
}

/**
 * Select a random fallback response, avoiding repeating the last one used.
 */
function selectFallbackResponse(language: 'cs' | 'en', category: string): string {
  const responses = loadFallbackResponses();
  const langResponses = responses[language];
  const categoryResponses = langResponses?.[category] ?? langResponses?.['generic_continue'] ?? ['Continue.'];

  const cacheKey = `${language}:${category}`;
  const lastIndex = _lastUsedIndex.get(cacheKey) ?? -1;

  let index: number;
  if (categoryResponses.length <= 1) {
    index = 0;
  } else {
    do {
      index = Math.floor(Math.random() * categoryResponses.length);
    } while (index === lastIndex);
  }

  _lastUsedIndex.set(cacheKey, index);
  return categoryResponses[index];
}

// ---- Moderation Result ----

export interface ModerationCheckResult {
  passed: boolean;
  flagged: boolean;
  categories: Record<string, boolean>;
  redirectResponse?: string;
}

/**
 * Check player input text through the OpenAI Moderation API.
 *
 * @param text - The player's text input (post-STT if audio)
 * @param language - Session language for selecting fallback responses
 * @returns Moderation result with pass/fail and optional redirect
 */
export async function moderatePlayerInput(
  text: string,
  language: 'cs' | 'en' = 'en',
): Promise<ModerationCheckResult> {
  const aiService = getAIService();

  const result = await aiService.moderateContent(text);

  if (result.flagged) {
    // Determine the most appropriate fallback category
    let fallbackCategory = 'generic_continue';
    if (result.categories['violence'] || result.categories['violence/graphic']) {
      fallbackCategory = 'error_acknowledgment';
    }

    const redirectResponse = selectFallbackResponse(language, fallbackCategory);

    logger.warn('Player input flagged by moderation', {
      flaggedCategories: Object.entries(result.categories)
        .filter(([, flagged]) => flagged)
        .map(([cat]) => cat),
      scores: Object.entries(result.categoryScores)
        .filter(([, score]) => score > 0.5)
        .reduce(
          (acc, [cat, score]) => {
            acc[cat] = score;
            return acc;
          },
          {} as Record<string, number>,
        ),
    });

    return {
      passed: false,
      flagged: true,
      categories: result.categories,
      redirectResponse,
    };
  }

  return {
    passed: true,
    flagged: false,
    categories: result.categories,
  };
}

/**
 * Get the loaded fallback responses (for pre-caching TTS).
 */
export function getFallbackResponses(): FallbackResponses {
  return loadFallbackResponses();
}
