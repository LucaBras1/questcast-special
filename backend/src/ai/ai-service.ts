import type { AICost } from './types.js';

/**
 * Abstract AI service interface.
 * All AI calls go through this abstraction layer -- never call OpenAI SDK directly.
 * This allows swapping providers (e.g., Deepgram for STT, ElevenLabs for TTS)
 * without changing business logic.
 */

export interface TranscriptionResult {
  text: string;
  language: string;
  durationSeconds: number;
  cost: Pick<AICost, 'sttCost'>;
}

export interface NarrationResult {
  text: string;
  parsedResponse: unknown;
  promptTokens: number;
  completionTokens: number;
  cost: Pick<AICost, 'llmInputCost' | 'llmOutputCost'>;
}

export interface SpeechResult {
  audioBuffer: Buffer;
  format: string;
  durationSeconds: number;
  cost: Pick<AICost, 'ttsCost'>;
}

export interface ImageResult {
  imageUrl: string;
  revisedPrompt: string;
  cost: Pick<AICost, 'imageCost'>;
}

export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
}

export interface AIService {
  /**
   * Transcribe audio to text using STT.
   * @param audioBuffer - Raw audio data (webm/opus)
   * @param language - Expected language hint ('cs' | 'en')
   */
  transcribe(audioBuffer: Buffer, language?: string): Promise<TranscriptionResult>;

  /**
   * Generate narrative response from the Dungeon Master LLM.
   * @param systemPrompt - The DM system prompt
   * @param conversationHistory - Recent messages for context
   * @param gameState - Current game state JSON to inject
   */
  generateNarration(
    systemPrompt: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    gameState: Record<string, unknown>,
  ): Promise<NarrationResult>;

  /**
   * Generate narration with streaming (sentence by sentence).
   * Returns an async iterator of text chunks.
   */
  generateNarrationStream(
    systemPrompt: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    gameState: Record<string, unknown>,
  ): AsyncIterable<string>;

  /**
   * Synthesize text to speech.
   * @param text - Text to synthesize
   * @param voice - Voice identifier
   */
  synthesizeSpeech(text: string, voice?: string): Promise<SpeechResult>;

  /**
   * Generate a scene image.
   * @param prompt - Image generation prompt
   * @param style - Art style
   */
  generateImage(prompt: string, style?: string): Promise<ImageResult>;

  /**
   * Check player input for content policy violations.
   * @param text - Player input text
   */
  moderateContent(text: string): Promise<ModerationResult>;
}
