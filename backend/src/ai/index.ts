import { OpenAIProvider } from './openai-provider.js';
import type { AIService } from './ai-service.js';
import { config } from '../utils/config.js';

/**
 * Singleton AI service instance.
 * Uses lazy initialization to avoid issues during build/test.
 */

let _aiService: AIService | null = null;

export function getAIService(): AIService {
  if (!_aiService) {
    _aiService = new OpenAIProvider(config.OPENAI_API_KEY);
  }
  return _aiService;
}

/**
 * Override the AI service instance (for testing).
 */
export function setAIService(service: AIService) {
  _aiService = service;
}

export type { AIService } from './ai-service.js';
export type {
  TranscriptionResult,
  NarrationResult,
  SpeechResult,
  ImageResult,
  ModerationResult,
} from './ai-service.js';
export { OpenAIProvider } from './openai-provider.js';
export { OPENAI_PRICING, calculateTotalCost } from './types.js';
export type { AICost } from './types.js';
