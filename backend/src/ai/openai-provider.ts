import OpenAI from 'openai';
import { z } from 'zod';
import type {
  AIService,
  TranscriptionResult,
  NarrationResult,
  SpeechResult,
  ImageResult,
  ModerationResult,
} from './ai-service.js';
import { OPENAI_PRICING } from './types.js';
import { AIServiceError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { llmNarrationResponseSchema } from '../models/schemas.js';

const MAX_LLM_OUTPUT_TOKENS = 200;

/**
 * OpenAI implementation of the AI service abstraction layer.
 * All OpenAI SDK calls are centralized here with error handling and cost tracking.
 */
export class OpenAIProvider implements AIService {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  // ---- STT: Whisper ----

  async transcribe(audioBuffer: Buffer, language?: string): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
      // Create a File object from the buffer for the OpenAI API
      const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

      const response = await this.client.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        language: language === 'cs' ? 'cs' : 'en',
        response_format: 'verbose_json',
      });

      const durationSeconds = response.duration ?? 0;
      const cost = durationSeconds * (OPENAI_PRICING.whisperPerMinute / 60);

      logger.info('STT transcription completed', {
        duration: Date.now() - startTime,
        audioDuration: durationSeconds,
        textLength: response.text.length,
        cost,
      });

      return {
        text: response.text,
        language: response.language ?? language ?? 'en',
        durationSeconds,
        cost: { sttCost: cost },
      };
    } catch (error) {
      logger.error('STT transcription failed', error);
      throw new AIServiceError('whisper', error);
    }
  }

  // ---- LLM: GPT-4o-mini ----

  async generateNarration(
    systemPrompt: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    gameState: Record<string, unknown>,
  ): Promise<NarrationResult> {
    const startTime = Date.now();

    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        {
          role: 'system',
          content: `Current game state:\n${JSON.stringify(gameState, null, 2)}`,
        },
        ...conversationHistory,
      ];

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: MAX_LLM_OUTPUT_TOKENS,
        temperature: 0.8,
        response_format: { type: 'json_object' },
      });

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        throw new Error('Empty response from LLM');
      }

      const rawContent = choice.message.content;
      let parsedResponse: z.infer<typeof llmNarrationResponseSchema>;

      try {
        const parsed = JSON.parse(rawContent);
        parsedResponse = llmNarrationResponseSchema.parse(parsed);
      } catch (parseError) {
        logger.warn('LLM response failed Zod validation, using raw text', {
          raw: rawContent,
          error: parseError,
        });
        // Fallback: treat entire response as narration text
        parsedResponse = { narration: rawContent };
      }

      const promptTokens = response.usage?.prompt_tokens ?? 0;
      const completionTokens = response.usage?.completion_tokens ?? 0;

      const inputCost = (promptTokens / 1000) * OPENAI_PRICING.gpt4oMiniInputPer1k;
      const outputCost = (completionTokens / 1000) * OPENAI_PRICING.gpt4oMiniOutputPer1k;

      logger.info('LLM narration completed', {
        duration: Date.now() - startTime,
        promptTokens,
        completionTokens,
        cost: inputCost + outputCost,
      });

      return {
        text: parsedResponse.narration,
        parsedResponse,
        promptTokens,
        completionTokens,
        cost: { llmInputCost: inputCost, llmOutputCost: outputCost },
      };
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      logger.error('LLM narration failed', error);
      throw new AIServiceError('gpt-4o-mini', error);
    }
  }

  // ---- LLM Streaming ----

  async *generateNarrationStream(
    systemPrompt: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    gameState: Record<string, unknown>,
  ): AsyncIterable<string> {
    try {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        {
          role: 'system',
          content: `Current game state:\n${JSON.stringify(gameState, null, 2)}`,
        },
        ...conversationHistory,
      ];

      const stream = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: MAX_LLM_OUTPUT_TOKENS,
        temperature: 0.8,
        stream: true,
      });

      let sentenceBuffer = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (!content) continue;

        sentenceBuffer += content;

        // Emit complete sentences for TTS pipeline
        const sentenceEnd = sentenceBuffer.search(/[.!?]\s/);
        if (sentenceEnd !== -1) {
          const sentence = sentenceBuffer.substring(0, sentenceEnd + 1).trim();
          sentenceBuffer = sentenceBuffer.substring(sentenceEnd + 1);
          if (sentence.length > 0) {
            yield sentence;
          }
        }
      }

      // Emit remaining buffer
      if (sentenceBuffer.trim().length > 0) {
        yield sentenceBuffer.trim();
      }
    } catch (error) {
      logger.error('LLM streaming failed', error);
      throw new AIServiceError('gpt-4o-mini-stream', error);
    }
  }

  // ---- TTS ----

  async synthesizeSpeech(text: string, voice: string = 'alloy'): Promise<SpeechResult> {
    const startTime = Date.now();

    try {
      const response = await this.client.audio.speech.create({
        model: 'tts-1',
        voice: voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
        input: text,
        response_format: 'opus',
        speed: 1.0,
      });

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      const cost = text.length * OPENAI_PRICING.ttsPerCharacter;

      // Rough estimate: opus at ~32kbps, so bytes / 4000 ~ seconds
      const estimatedDuration = audioBuffer.length / 4000;

      logger.info('TTS synthesis completed', {
        duration: Date.now() - startTime,
        textLength: text.length,
        audioBytes: audioBuffer.length,
        cost,
      });

      return {
        audioBuffer,
        format: 'opus',
        durationSeconds: estimatedDuration,
        cost: { ttsCost: cost },
      };
    } catch (error) {
      logger.error('TTS synthesis failed', error);
      throw new AIServiceError('tts-1', error);
    }
  }

  // ---- Image Generation ----

  async generateImage(prompt: string, _style?: string): Promise<ImageResult> {
    const startTime = Date.now();

    try {
      const response = await this.client.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      });

      const imageData = response.data?.[0];
      if (!imageData?.url) {
        throw new Error('No image URL in response');
      }

      logger.info('Image generation completed', {
        duration: Date.now() - startTime,
        cost: OPENAI_PRICING.dallePerImage,
      });

      return {
        imageUrl: imageData.url,
        revisedPrompt: imageData.revised_prompt ?? prompt,
        cost: { imageCost: OPENAI_PRICING.dallePerImage },
      };
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      logger.error('Image generation failed', error);
      throw new AIServiceError('dall-e-3', error);
    }
  }

  // ---- Content Moderation ----

  async moderateContent(text: string): Promise<ModerationResult> {
    try {
      const response = await this.client.moderations.create({
        input: text,
      });

      const result = response.results[0];
      if (!result) {
        throw new Error('Empty moderation response');
      }

      logger.info('Moderation check completed', {
        flagged: result.flagged,
      });

      return {
        flagged: result.flagged,
        categories: result.categories as unknown as Record<string, boolean>,
        categoryScores: result.category_scores as unknown as Record<string, number>,
      };
    } catch (error) {
      logger.error('Moderation check failed', error);
      // On moderation failure, default to flagged (fail-safe)
      return {
        flagged: true,
        categories: {},
        categoryScores: {},
      };
    }
  }
}
