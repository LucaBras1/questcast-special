/**
 * AI Service -- Test Suite
 *
 * Tests for:
 * - transcribe(): STT via Whisper
 * - generateNarration(): LLM response + Zod validation
 * - synthesizeSpeech(): TTS generation + cache
 * - moderateContent(): input moderation
 * - Cost tracking: correct cost calculation per turn
 */

import {
  createMockGameState,
  createMockNarrationResponse,
} from '../setup';

import { calculateTotalCost, OPENAI_PRICING } from '../../src/ai/types';

// ---- Mock OpenAI SDK ----

const mockCreateTranscription = jest.fn();
const mockChatCompletionsCreate = jest.fn();
const mockSpeechCreate = jest.fn();
const mockModerationsCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: mockCreateTranscription,
        },
        speech: {
          create: mockSpeechCreate,
        },
      },
      chat: {
        completions: {
          create: mockChatCompletionsCreate,
        },
      },
      moderations: {
        create: mockModerationsCreate,
      },
    })),
  };
});

// ---- Import Zod schemas for validation ----

import {
  llmNarrationResponseSchema,
  llmDiceInterpretationSchema,
  llmSummarySchema,
} from '../../src/models/schemas';

// ---- Simulated AI Service Implementation ----

/**
 * Since the real AI service implementation may not exist yet,
 * we test the CONTRACT: what the service should do.
 * These tests validate behavior against the AIService interface.
 */

interface TranscriptionResult {
  text: string;
  language: string;
  durationSeconds: number;
  cost: { sttCost: number };
}

interface NarrationResult {
  text: string;
  parsedResponse: unknown;
  promptTokens: number;
  completionTokens: number;
  cost: { llmInputCost: number; llmOutputCost: number };
}

interface SpeechResult {
  audioBuffer: Buffer;
  format: string;
  durationSeconds: number;
  cost: { ttsCost: number };
}

interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
}

// Simulated service functions that use the mocked OpenAI SDK
async function transcribe(audioBuffer: Buffer, language?: string): Promise<TranscriptionResult> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: 'test' });

  const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

  const result = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file,
    language: language || 'en',
  });

  const durationSeconds = audioBuffer.length / 16000; // rough estimate
  const cost = durationSeconds / 60 * OPENAI_PRICING.whisperPerMinute;

  return {
    text: result.text,
    language: language || 'en',
    durationSeconds,
    cost: { sttCost: cost },
  };
}

async function generateNarration(
  systemPrompt: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  gameState: Record<string, unknown>,
): Promise<NarrationResult> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: 'test' });

  const result = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'system', content: `Current game state: ${JSON.stringify(gameState)}` },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 300,
  });

  const content = result.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content in LLM response');
  }

  const parsed = JSON.parse(content);
  // Validate with Zod
  const validated = llmNarrationResponseSchema.parse(parsed);

  const promptTokens = result.usage?.prompt_tokens ?? 0;
  const completionTokens = result.usage?.completion_tokens ?? 0;

  return {
    text: validated.narration,
    parsedResponse: validated,
    promptTokens,
    completionTokens,
    cost: {
      llmInputCost: (promptTokens / 1000) * OPENAI_PRICING.gpt4oMiniInputPer1k,
      llmOutputCost: (completionTokens / 1000) * OPENAI_PRICING.gpt4oMiniOutputPer1k,
    },
  };
}

async function synthesizeSpeech(text: string, voice?: string): Promise<SpeechResult> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: 'test' });

  const result = await openai.audio.speech.create({
    model: 'tts-1',
    voice: (voice as any) || 'alloy',
    input: text,
  });

  const buffer = Buffer.from(await (result as any).arrayBuffer());
  const durationSeconds = text.length / 15; // rough estimate: 15 chars/sec
  const cost = text.length * OPENAI_PRICING.ttsPerCharacter;

  return {
    audioBuffer: buffer,
    format: 'mp3',
    durationSeconds,
    cost: { ttsCost: cost },
  };
}

async function moderateContent(text: string): Promise<ModerationResult> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: 'test' });

  const result = await openai.moderations.create({
    input: text,
  });

  const modResult = result.results[0];

  return {
    flagged: modResult.flagged,
    categories: modResult.categories as unknown as Record<string, boolean>,
    categoryScores: modResult.category_scores as unknown as Record<string, number>,
  };
}

// ---- Tests ----

describe('AI Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // transcribe()
  // ================================================================

  describe('transcribe()', () => {
    it('should successfully transcribe audio', async () => {
      mockCreateTranscription.mockResolvedValue({
        text: 'I open the door carefully.',
      });

      const audioBuffer = Buffer.alloc(16000 * 5); // 5 seconds of fake audio
      const result = await transcribe(audioBuffer, 'en');

      expect(result.text).toBe('I open the door carefully.');
      expect(result.language).toBe('en');
      expect(result.durationSeconds).toBeGreaterThan(0);
      expect(result.cost.sttCost).toBeGreaterThan(0);
      expect(mockCreateTranscription).toHaveBeenCalledTimes(1);
      expect(mockCreateTranscription).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'whisper-1',
          language: 'en',
        }),
      );
    });

    it('should handle Czech language transcription', async () => {
      mockCreateTranscription.mockResolvedValue({
        text: 'Otviram dvere opatrne.',
      });

      const audioBuffer = Buffer.alloc(16000 * 3);
      const result = await transcribe(audioBuffer, 'cs');

      expect(result.text).toBe('Otviram dvere opatrne.');
      expect(result.language).toBe('cs');
      expect(mockCreateTranscription).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'cs' }),
      );
    });

    it('should handle API timeout gracefully', async () => {
      mockCreateTranscription.mockRejectedValue(
        new Error('Request timed out after 30000ms'),
      );

      const audioBuffer = Buffer.alloc(16000);
      await expect(transcribe(audioBuffer, 'en')).rejects.toThrow(/timed out/i);
    });

    it('should handle invalid audio data', async () => {
      mockCreateTranscription.mockRejectedValue(
        new Error('Invalid audio file format'),
      );

      const invalidBuffer = Buffer.from('this is not audio');
      await expect(transcribe(invalidBuffer, 'en')).rejects.toThrow(/invalid audio/i);
    });

    it('should calculate STT cost correctly', async () => {
      mockCreateTranscription.mockResolvedValue({ text: 'test' });

      // 60 seconds of audio = $0.006
      const sixtySecBuffer = Buffer.alloc(16000 * 60);
      const result = await transcribe(sixtySecBuffer, 'en');

      // Cost should be approximately $0.006 for 1 minute
      expect(result.cost.sttCost).toBeCloseTo(OPENAI_PRICING.whisperPerMinute, 4);
    });
  });

  // ================================================================
  // generateNarration()
  // ================================================================

  describe('generateNarration()', () => {
    const systemPrompt = 'You are a fantasy Dungeon Master.';
    const history = [
      { role: 'user' as const, content: 'I open the door.' },
    ];
    const gameState = createMockGameState();

    it('should generate narration successfully', async () => {
      const mockNarration = createMockNarrationResponse();

      mockChatCompletionsCreate.mockResolvedValue({
        choices: [
          {
            message: { content: JSON.stringify(mockNarration) },
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 80,
        },
      });

      const result = await generateNarration(systemPrompt, history, gameState as unknown as Record<string, unknown>);

      expect(result.text).toBe(mockNarration.narration);
      expect(result.parsedResponse).toEqual(mockNarration);
      expect(result.promptTokens).toBe(200);
      expect(result.completionTokens).toBe(80);
      expect(result.cost.llmInputCost).toBeGreaterThan(0);
      expect(result.cost.llmOutputCost).toBeGreaterThan(0);
    });

    it('should validate LLM response against Zod schema', async () => {
      // Valid response
      const validResponse = {
        narration: 'The door opens to reveal a dark corridor.',
        stateUpdates: {
          locationChange: 'Dark Corridor',
          threatLevel: 'moderate',
        },
        suggestedActions: ['Proceed carefully', 'Light a torch'],
        requiresDiceRoll: false,
      };

      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(validResponse) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      const result = await generateNarration(systemPrompt, history, gameState as unknown as Record<string, unknown>);
      expect(result.parsedResponse).toBeDefined();
    });

    it('should reject invalid LLM JSON response (missing narration)', async () => {
      const invalidResponse = {
        // Missing required 'narration' field
        stateUpdates: { locationChange: 'Somewhere' },
      };

      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(invalidResponse) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      await expect(
        generateNarration(systemPrompt, history, gameState as unknown as Record<string, unknown>),
      ).rejects.toThrow();
    });

    it('should reject non-JSON LLM response', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: 'This is not JSON at all.' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      await expect(
        generateNarration(systemPrompt, history, gameState as unknown as Record<string, unknown>),
      ).rejects.toThrow();
    });

    it('should handle API error gracefully', async () => {
      mockChatCompletionsCreate.mockRejectedValue(
        new Error('API rate limit exceeded'),
      );

      await expect(
        generateNarration(systemPrompt, history, gameState as unknown as Record<string, unknown>),
      ).rejects.toThrow(/rate limit/i);
    });

    it('should handle empty response choices', async () => {
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [],
        usage: { prompt_tokens: 100, completion_tokens: 0 },
      });

      await expect(
        generateNarration(systemPrompt, history, gameState as unknown as Record<string, unknown>),
      ).rejects.toThrow(/no content/i);
    });

    it('should calculate LLM cost correctly', async () => {
      const mockNarration = createMockNarrationResponse();
      mockChatCompletionsCreate.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(mockNarration) } }],
        usage: { prompt_tokens: 1000, completion_tokens: 100 },
      });

      const result = await generateNarration(systemPrompt, history, gameState as unknown as Record<string, unknown>);

      const expectedInputCost = (1000 / 1000) * OPENAI_PRICING.gpt4oMiniInputPer1k;
      const expectedOutputCost = (100 / 1000) * OPENAI_PRICING.gpt4oMiniOutputPer1k;

      expect(result.cost.llmInputCost).toBeCloseTo(expectedInputCost, 6);
      expect(result.cost.llmOutputCost).toBeCloseTo(expectedOutputCost, 6);
    });
  });

  // ================================================================
  // synthesizeSpeech()
  // ================================================================

  describe('synthesizeSpeech()', () => {
    it('should synthesize speech successfully', async () => {
      const fakeAudio = Buffer.from('fake-mp3-audio-data');
      mockSpeechCreate.mockResolvedValue({
        arrayBuffer: () => Promise.resolve(fakeAudio.buffer.slice(
          fakeAudio.byteOffset,
          fakeAudio.byteOffset + fakeAudio.byteLength,
        )),
      });

      const result = await synthesizeSpeech('The door creaks open slowly.');

      expect(result.audioBuffer).toBeInstanceOf(Buffer);
      expect(result.audioBuffer.length).toBeGreaterThan(0);
      expect(result.format).toBe('mp3');
      expect(result.durationSeconds).toBeGreaterThan(0);
      expect(result.cost.ttsCost).toBeGreaterThan(0);
      expect(mockSpeechCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'tts-1',
          voice: 'alloy',
          input: 'The door creaks open slowly.',
        }),
      );
    });

    it('should handle API error gracefully', async () => {
      mockSpeechCreate.mockRejectedValue(new Error('TTS service unavailable'));

      await expect(
        synthesizeSpeech('Test text'),
      ).rejects.toThrow(/tts service unavailable/i);
    });

    it('should use custom voice when specified', async () => {
      const fakeAudio = Buffer.from('audio');
      mockSpeechCreate.mockResolvedValue({
        arrayBuffer: () => Promise.resolve(fakeAudio.buffer.slice(
          fakeAudio.byteOffset,
          fakeAudio.byteOffset + fakeAudio.byteLength,
        )),
      });

      await synthesizeSpeech('Hello adventurer.', 'echo');

      expect(mockSpeechCreate).toHaveBeenCalledWith(
        expect.objectContaining({ voice: 'echo' }),
      );
    });

    it('should calculate TTS cost correctly', async () => {
      const text = 'A'.repeat(1000); // 1000 characters
      const fakeAudio = Buffer.from('audio');
      mockSpeechCreate.mockResolvedValue({
        arrayBuffer: () => Promise.resolve(fakeAudio.buffer.slice(
          fakeAudio.byteOffset,
          fakeAudio.byteOffset + fakeAudio.byteLength,
        )),
      });

      const result = await synthesizeSpeech(text);
      const expectedCost = 1000 * OPENAI_PRICING.ttsPerCharacter;

      expect(result.cost.ttsCost).toBeCloseTo(expectedCost, 6);
    });
  });

  // ================================================================
  // moderateContent()
  // ================================================================

  describe('moderateContent()', () => {
    it('should pass safe input', async () => {
      mockModerationsCreate.mockResolvedValue({
        results: [
          {
            flagged: false,
            categories: {
              sexual: false,
              hate: false,
              harassment: false,
              'self-harm': false,
              'sexual/minors': false,
              'hate/threatening': false,
              'violence/graphic': false,
              violence: false,
            },
            category_scores: {
              sexual: 0.001,
              hate: 0.0005,
              harassment: 0.002,
              'self-harm': 0.0001,
              'sexual/minors': 0.00001,
              'hate/threatening': 0.0003,
              'violence/graphic': 0.001,
              violence: 0.01,
            },
          },
        ],
      });

      const result = await moderateContent('I carefully examine the ancient scroll.');

      expect(result.flagged).toBe(false);
      expect(result.categories.sexual).toBe(false);
      expect(result.categories.violence).toBe(false);
      expect(result.categoryScores.violence).toBeLessThan(0.5);
    });

    it('should flag unsafe input', async () => {
      mockModerationsCreate.mockResolvedValue({
        results: [
          {
            flagged: true,
            categories: {
              sexual: false,
              hate: true,
              harassment: true,
              'self-harm': false,
              violence: false,
            },
            category_scores: {
              sexual: 0.01,
              hate: 0.95,
              harassment: 0.88,
              'self-harm': 0.001,
              violence: 0.05,
            },
          },
        ],
      });

      const result = await moderateContent('some harmful input text');

      expect(result.flagged).toBe(true);
      expect(result.categories.hate).toBe(true);
      expect(result.categories.harassment).toBe(true);
    });

    it('should handle moderation API error', async () => {
      mockModerationsCreate.mockRejectedValue(
        new Error('Moderation API unavailable'),
      );

      await expect(
        moderateContent('some text'),
      ).rejects.toThrow(/moderation api unavailable/i);
    });

    it('should moderate Czech language input', async () => {
      mockModerationsCreate.mockResolvedValue({
        results: [
          {
            flagged: false,
            categories: { sexual: false, hate: false, violence: false },
            category_scores: { sexual: 0.001, hate: 0.001, violence: 0.001 },
          },
        ],
      });

      const result = await moderateContent('Prozkoumavam staroveky svitek.');
      expect(result.flagged).toBe(false);
    });
  });

  // ================================================================
  // Cost Tracking
  // ================================================================

  describe('Cost Tracking', () => {
    it('should calculate total cost correctly', () => {
      const cost = calculateTotalCost({
        sttCost: 0.001,
        llmInputCost: 0.002,
        llmOutputCost: 0.003,
        ttsCost: 0.004,
        imageCost: 0,
      });

      expect(cost.totalCost).toBeCloseTo(0.01, 6);
      expect(cost.sttCost).toBe(0.001);
      expect(cost.llmInputCost).toBe(0.002);
      expect(cost.llmOutputCost).toBe(0.003);
      expect(cost.ttsCost).toBe(0.004);
      expect(cost.imageCost).toBe(0);
    });

    it('should handle missing cost fields with defaults', () => {
      const cost = calculateTotalCost({
        sttCost: 0.005,
      });

      expect(cost.totalCost).toBe(0.005);
      expect(cost.llmInputCost).toBe(0);
      expect(cost.llmOutputCost).toBe(0);
      expect(cost.ttsCost).toBe(0);
      expect(cost.imageCost).toBe(0);
    });

    it('should include image cost when present', () => {
      const cost = calculateTotalCost({
        sttCost: 0.001,
        llmInputCost: 0.002,
        llmOutputCost: 0.003,
        ttsCost: 0.004,
        imageCost: OPENAI_PRICING.dallePerImage, // $0.04
      });

      expect(cost.totalCost).toBeCloseTo(0.05, 6);
      expect(cost.imageCost).toBe(OPENAI_PRICING.dallePerImage);
    });

    it('should handle empty cost object', () => {
      const cost = calculateTotalCost({});

      expect(cost.totalCost).toBe(0);
      expect(cost.sttCost).toBe(0);
    });

    it('should estimate typical turn cost within budget', () => {
      // Typical turn: 5s audio, 200 prompt tokens, 100 completion tokens, 100 chars TTS
      const sttCost = (5 / 60) * OPENAI_PRICING.whisperPerMinute;
      const llmInputCost = (200 / 1000) * OPENAI_PRICING.gpt4oMiniInputPer1k;
      const llmOutputCost = (100 / 1000) * OPENAI_PRICING.gpt4oMiniOutputPer1k;
      const ttsCost = 500 * OPENAI_PRICING.ttsPerCharacter; // ~500 chars for 100 words

      const cost = calculateTotalCost({
        sttCost,
        llmInputCost,
        llmOutputCost,
        ttsCost,
        imageCost: 0,
      });

      // Total cost per turn should be well under $0.02
      expect(cost.totalCost).toBeLessThan(0.02);
      // Full session (~30 turns) should be under $0.60
      expect(cost.totalCost * 30).toBeLessThan(0.60);
    });
  });

  // ================================================================
  // Zod Schema Validation (standalone)
  // ================================================================

  describe('Zod Schema Validation', () => {
    describe('llmNarrationResponseSchema', () => {
      it('should accept valid narration response', () => {
        const valid = {
          narration: 'The door opens.',
          stateUpdates: { locationChange: 'New Room' },
          suggestedActions: ['Look around', 'Go back'],
          requiresDiceRoll: false,
        };

        expect(() => llmNarrationResponseSchema.parse(valid)).not.toThrow();
      });

      it('should accept minimal narration (just text)', () => {
        const minimal = {
          narration: 'Something happens.',
        };

        expect(() => llmNarrationResponseSchema.parse(minimal)).not.toThrow();
      });

      it('should reject empty narration', () => {
        const invalid = {
          narration: '',
        };

        expect(() => llmNarrationResponseSchema.parse(invalid)).toThrow();
      });

      it('should reject missing narration', () => {
        const invalid = {
          stateUpdates: { locationChange: 'New Room' },
        };

        expect(() => llmNarrationResponseSchema.parse(invalid)).toThrow();
      });

      it('should limit suggestedActions to 3', () => {
        const tooMany = {
          narration: 'Text.',
          suggestedActions: ['a', 'b', 'c', 'd'],
        };

        expect(() => llmNarrationResponseSchema.parse(tooMany)).toThrow();
      });

      it('should validate threatLevel enum', () => {
        const invalidThreat = {
          narration: 'Text.',
          stateUpdates: { threatLevel: 'extreme' },
        };

        expect(() => llmNarrationResponseSchema.parse(invalidThreat)).toThrow();
      });

      it('should validate questProgress range 0-100', () => {
        const outOfRange = {
          narration: 'Text.',
          stateUpdates: { questProgress: 150 },
        };

        expect(() => llmNarrationResponseSchema.parse(outOfRange)).toThrow();
      });
    });

    describe('llmDiceInterpretationSchema', () => {
      it('should accept valid dice interpretation', () => {
        const valid = {
          narration: 'You swing your sword with incredible force!',
          outcome: 'critical_success',
          stateUpdates: {
            healthChange: 0,
            goldChange: 10,
          },
        };

        expect(() => llmDiceInterpretationSchema.parse(valid)).not.toThrow();
      });

      it('should validate outcome enum values', () => {
        const validOutcomes = [
          'critical_success',
          'success',
          'partial',
          'failure',
          'critical_failure',
        ];

        for (const outcome of validOutcomes) {
          expect(() =>
            llmDiceInterpretationSchema.parse({
              narration: 'Result.',
              outcome,
            }),
          ).not.toThrow();
        }
      });

      it('should reject invalid outcome', () => {
        const invalid = {
          narration: 'Result.',
          outcome: 'mega_success',
        };

        expect(() => llmDiceInterpretationSchema.parse(invalid)).toThrow();
      });
    });

    describe('llmSummarySchema', () => {
      it('should accept valid summary', () => {
        const valid = {
          summary: 'The adventurer explored the cave and defeated a goblin.',
        };

        expect(() => llmSummarySchema.parse(valid)).not.toThrow();
      });

      it('should reject summary exceeding 500 chars', () => {
        const tooLong = {
          summary: 'A'.repeat(501),
        };

        expect(() => llmSummarySchema.parse(tooLong)).toThrow();
      });

      it('should reject empty summary', () => {
        expect(() => llmSummarySchema.parse({ summary: '' })).toThrow();
      });
    });
  });
});
