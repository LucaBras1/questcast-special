import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/authenticate.js';
import { validateParams } from '../middleware/validate.js';
import { sessionIdParamSchema, turnRequestSchema, llmNarrationResponseSchema } from '../models/schemas.js';
import { getAIService } from '../ai/index.js';
import { moderatePlayerInput } from '../middleware/content-moderation.js';
import { TurnCostTracker } from '../services/cost-tracker.js';
import {
  getGameState,
  updateGameState,
  recordGameEvent,
  addToConversationHistory,
  getSession,
  checkSessionTimeLimit,
} from '../services/game-service.js';
import { getHistory, bufferSSEEvent, getBufferedSSEEvents } from '../services/redis.js';
import {
  assembleSystemPrompt,
  formatConversationHistory,
} from '../services/prompt-service.js';
import { synthesizeWithCache } from '../services/tts-cache.js';
import { shouldGenerateSummary, generateNarrativeSummary } from '../services/summary-service.js';
import { logger } from '../utils/logger.js';
import { circuitBreakers } from '../utils/circuit-breaker.js';
import { CircuitBreakerOpenError } from '../utils/circuit-breaker.js';
import { generateSceneImage, ImageLimitError } from '../services/image-service.js';
import { trackTurnCompleted, trackError } from '../services/analytics.js';
import type { GameState } from '../../../shared/types/index.js';
import { CONVERSATION_HISTORY_WINDOW, MAX_IMAGES_PER_SESSION } from '../../../shared/constants/index.js';

/**
 * SSE helper: format and send an SSE event to the client.
 */
function sendSSE(
  reply: FastifyReply,
  eventId: number,
  eventType: string,
  data: unknown,
): void {
  const payload = JSON.stringify(data);
  reply.raw.write(`id: ${eventId}\n`);
  reply.raw.write(`event: ${eventType}\n`);
  reply.raw.write(`data: ${payload}\n\n`);
}

/**
 * Split text into sentences for streaming TTS.
 * Handles common sentence-ending punctuation.
 */
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by a space or end-of-string
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g);
  if (!sentences) return [text];
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

export async function turnRoutes(app: FastifyInstance) {
  // All turn routes require authentication
  app.addHook('preHandler', authenticate);

  /**
   * POST /api/game/session/:id/turn
   *
   * The core endpoint: player speaks -> AI responds with voice.
   * Implements the full pipeline: STT -> Moderation -> LLM (streaming) -> TTS -> SSE
   *
   * Responds with Server-Sent Events (SSE).
   */
  app.post(
    '/session/:id/turn',
    {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: '10 seconds',
          keyGenerator: (request: FastifyRequest) => {
            const params = request.params as { id: string };
            return `turn:${params.id}`;
          },
        },
      },
      preHandler: [validateParams(sessionIdParamSchema)],
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
      const sessionId = request.params.id;
      const turnId = uuidv4();
      let eventId = 0;

      // Parse and validate body
      const body = turnRequestSchema.parse(request.body);

      // Verify session ownership
      const session = await getSession(sessionId, request.userId);
      if (session.status !== 'active') {
        return reply.status(400).send({
          code: 'SESSION_NOT_ACTIVE',
          message: `Session is ${session.status}. Cannot process turns.`,
        });
      }

      // Check session time limit
      const preGameState = await getGameState(sessionId);

      // Increment time elapsed (estimate ~1.5 min per turn)
      preGameState.session.timeElapsedMinutes += 1.5;

      const timeStatus = checkSessionTimeLimit(preGameState);
      if (timeStatus === 'hard_limit') {
        // Set up SSE for hard limit notification
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        const limitEventId = 1;
        sendSSE(reply, limitEventId, 'session_limit_reached', {
          reason: 'hard_limit',
          timeElapsedMinutes: preGameState.session.timeElapsedMinutes,
          message: 'Session has reached the 60-minute time limit. Auto-saving.',
          timestamp: Date.now(),
        });

        // Auto-save the session
        try {
          const { saveSessionFull } = await import('../services/game-service.js');
          await saveSessionFull(sessionId);
        } catch (saveError) {
          logger.error('Failed to auto-save on hard limit', { sessionId, error: saveError });
        }

        reply.raw.end();
        return;
      }

      // Set up SSE response headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      // Check for SSE reconnection (Last-Event-ID)
      const lastEventIdHeader = request.headers['last-event-id'];
      if (lastEventIdHeader) {
        const lastEventId = parseInt(lastEventIdHeader as string, 10);
        if (!isNaN(lastEventId)) {
          const missedEvents = await getBufferedSSEEvents(sessionId, lastEventId);
          for (const evt of missedEvents) {
            sendSSE(reply, evt.id, evt.type, evt.data);
          }
          // If we sent missed events, end the response (client will re-submit turn)
          if (missedEvents.length > 0) {
            reply.raw.end();
            return;
          }
        }
      }

      // Helper to send and buffer SSE events
      const emit = async (type: string, data: unknown) => {
        eventId++;
        const timestamp = Date.now();
        sendSSE(reply, eventId, type, { ...((data && typeof data === 'object') ? data : {}), timestamp });
        await bufferSSEEvent(sessionId, { id: eventId, type, data, timestamp });
      };

      // Initialize cost tracker
      const gameState = await getGameState(sessionId);
      const costTracker = new TurnCostTracker(sessionId, request.userId, gameState.session.turnsPlayed + 1);

      try {
        // ---- TURN START ----
        await emit('turn_start', { turnId });

        // ---- STT (if audio input) ----
        let playerText: string;

        if (body.audioBase64) {
          const audioBuffer = Buffer.from(body.audioBase64, 'base64');
          const aiService = getAIService();

          const language = (session.gameState as unknown as GameState)?.story
            ? 'en'
            : 'en'; // Default to English; will be set by session language later

          const sttBreaker = circuitBreakers.stt();
          const transcription = await sttBreaker.execute(() =>
            aiService.transcribe(audioBuffer, language),
          );
          playerText = transcription.text;
          costTracker.addSTTCost(transcription.cost.sttCost);

          await emit('transcription', {
            text: transcription.text,
            language: transcription.language,
          });
        } else if (body.textInput) {
          playerText = body.textInput;
          await emit('transcription', {
            text: playerText,
            language: 'en',
          });
        } else {
          await emit('error', { code: 'NO_INPUT', message: 'No audio or text input provided' });
          reply.raw.end();
          return;
        }

        // ---- INPUT MODERATION ----
        const moderationResult = await moderatePlayerInput(playerText, 'en');
        costTracker.addModerationCost();

        if (!moderationResult.passed) {
          // Flagged: return in-game redirect response
          const redirectText = moderationResult.redirectResponse ?? 'The world shimmers for a moment. What do you do?';

          await emit('moderation_pass', { safe: false });
          await emit('narration_chunk', { text: redirectText, sentenceIndex: 0 });

          // Generate TTS for redirect
          try {
            const ttsResult = await synthesizeWithCache(redirectText);
            costTracker.addTTSCost(ttsResult.cost);
            await emit('tts_chunk', { audioBase64: ttsResult.audioBase64, sentenceIndex: 0 });
            await emit('tts_complete', { audioCount: 1 });
          } catch (ttsError) {
            logger.error('TTS failed for moderation redirect', ttsError);
          }

          await emit('narration_complete', { fullText: redirectText, tokensUsed: 0 });

          const finalCost = costTracker.finalize();
          await emit('turn_end', { turnId, cost: finalCost, latencyMs: finalCost.latencyMs });
          reply.raw.end();
          return;
        }

        await emit('moderation_pass', { safe: true });

        // ---- ADD PLAYER INPUT TO HISTORY ----
        await addToConversationHistory(
          sessionId,
          'user',
          playerText,
          gameState.session.turnsPlayed + 1,
        );

        // ---- ASSEMBLE PROMPT ----
        const conversationHistory = await getHistory(sessionId, CONVERSATION_HISTORY_WINDOW);
        let systemPrompt = assembleSystemPrompt(
          'en', // TODO: get from session/user preferences
          'teen', // TODO: get from user preferences
          gameState,
          gameState.story.narrativeSummary,
        );

        // Inject soft time limit instruction at 45 min
        if (timeStatus === 'soft_limit') {
          systemPrompt += '\n\n[SYSTEM INSTRUCTION - TIME LIMIT]: The session is approaching its time limit. Begin wrapping the current scene toward a natural pause point within the next 2-3 turns. Guide the story toward a satisfying cliffhanger or resting point.';
          await emit('time_warning', {
            timeElapsedMinutes: preGameState.session.timeElapsedMinutes,
            message: 'Session approaching time limit. The story will begin wrapping up.',
          });
        }

        const chatHistory = formatConversationHistory(conversationHistory);

        // ---- LLM STREAMING ----
        const aiService = getAIService();
        const sentences: string[] = [];
        let fullNarration = '';
        let sentenceIndex = 0;

        // Collect all streamed text first, then split into sentences
        const streamedChunks: string[] = [];

        try {
          for await (const chunk of aiService.generateNarrationStream(
            systemPrompt,
            chatHistory,
            gameState as unknown as Record<string, unknown>,
          )) {
            streamedChunks.push(chunk);

            // Emit each chunk as a narration piece
            await emit('narration_chunk', { text: chunk, sentenceIndex });
            sentences.push(chunk);
            sentenceIndex++;
          }
        } catch (streamError) {
          logger.error('LLM streaming failed, attempting non-streaming fallback', streamError);

          // Fallback: try non-streaming
          try {
            const fallbackResult = await aiService.generateNarration(
              systemPrompt,
              chatHistory,
              gameState as unknown as Record<string, unknown>,
            );
            costTracker.addLLMCost(
              fallbackResult.cost.llmInputCost,
              fallbackResult.cost.llmOutputCost,
            );

            const fallbackSentences = splitIntoSentences(fallbackResult.text);
            for (const sentence of fallbackSentences) {
              await emit('narration_chunk', { text: sentence, sentenceIndex });
              sentences.push(sentence);
              sentenceIndex++;
            }

            fullNarration = fallbackResult.text;

            // Parse state updates from non-streaming response
            if (fallbackResult.parsedResponse) {
              const parsed = llmNarrationResponseSchema.safeParse(fallbackResult.parsedResponse);
              if (parsed.success && parsed.data.stateUpdates) {
                const stateUpdates = parsed.data.stateUpdates;
                await updateGameState(sessionId, stateUpdates);
                await emit('state_update', { gameState: stateUpdates });
              }
            }
          } catch (fallbackError) {
            // Final fallback: use a canned response
            logger.error('Both streaming and non-streaming LLM failed', fallbackError);
            const fallbackText = 'The world shimmers around you. A mysterious force seems to pause time itself. What do you do next?';
            await emit('narration_chunk', { text: fallbackText, sentenceIndex: 0 });
            sentences.push(fallbackText);
            fullNarration = fallbackText;
          }
        }

        if (!fullNarration) {
          fullNarration = sentences.join(' ');
        }

        // Estimate LLM cost for streaming (we don't get exact token counts from streaming)
        // Rough estimate: 4 chars per token
        const estimatedInputTokens = systemPrompt.length / 4 + chatHistory.reduce((acc, m) => acc + m.content.length, 0) / 4;
        const estimatedOutputTokens = fullNarration.length / 4;
        costTracker.addLLMCost(
          (estimatedInputTokens / 1000) * 0.00015,
          (estimatedOutputTokens / 1000) * 0.0006,
        );

        await emit('narration_complete', {
          fullText: fullNarration,
          tokensUsed: Math.round(estimatedOutputTokens),
        });

        // ---- ADD AI RESPONSE TO HISTORY ----
        await addToConversationHistory(
          sessionId,
          'assistant',
          fullNarration,
          gameState.session.turnsPlayed + 1,
        );

        // ---- TTS (parallel with state update) ----
        const ttsPromises: Promise<void>[] = [];
        const ttsResults: Array<{ audioBase64: string; sentenceIndex: number }> = [];

        for (let i = 0; i < sentences.length; i++) {
          const sentence = sentences[i];
          const idx = i;

          const ttsPromise = (async () => {
            try {
              const ttsResult = await synthesizeWithCache(sentence);
              costTracker.addTTSCost(ttsResult.cost);
              ttsResults.push({ audioBase64: ttsResult.audioBase64, sentenceIndex: idx });
              await emit('tts_chunk', { audioBase64: ttsResult.audioBase64, sentenceIndex: idx });
            } catch (ttsError) {
              logger.error('TTS failed for sentence', { sentenceIndex: idx, error: ttsError });
            }
          })();

          ttsPromises.push(ttsPromise);
        }

        // ---- STATE UPDATE (parse LLM response for game state changes) ----
        // For streaming, we attempt to parse the full narration as JSON
        // (LLM may not return JSON in streaming mode -- that is expected)
        try {
          const parsed = JSON.parse(fullNarration);
          const validated = llmNarrationResponseSchema.safeParse(parsed);
          if (validated.success && validated.data.stateUpdates) {
            await updateGameState(sessionId, validated.data.stateUpdates);
            await emit('state_update', { gameState: validated.data.stateUpdates });
          }
        } catch {
          // Not JSON -- streaming mode typically returns plain text.
          // Just increment the turn counter.
          await updateGameState(sessionId, {});
        }

        // Wait for all TTS to complete
        await Promise.allSettled(ttsPromises);
        await emit('tts_complete', { audioCount: ttsResults.length });

        // ---- RECORD GAME EVENT ----
        const finalCost = costTracker.finalize();
        const updatedGameState = await getGameState(sessionId);

        await recordGameEvent(
          sessionId,
          updatedGameState.session.turnsPlayed,
          playerText,
          fullNarration,
          updatedGameState,
          finalCost,
        );

        // ---- TURN END ----
        await emit('turn_end', {
          turnId,
          cost: finalCost,
          latencyMs: finalCost.latencyMs,
        });

        // Track analytics
        trackTurnCompleted(
          sessionId,
          request.userId,
          updatedGameState.session.turnsPlayed,
          finalCost.latencyMs,
          finalCost.totalCost,
          'en', // TODO: get from session/user preferences
        );

        // ---- POST-TURN: Auto-trigger image generation (non-blocking) ----
        // Check if the LLM response indicated an image should be generated
        try {
          const parsedForImage = JSON.parse(fullNarration);
          if (
            parsedForImage.shouldGenerateImage === true &&
            parsedForImage.imagePrompt &&
            updatedGameState.session.imagesGenerated < MAX_IMAGES_PER_SESSION
          ) {
            generateSceneImage(
              sessionId,
              request.userId,
              parsedForImage.imagePrompt,
              'epic_fantasy', // Default art style for auto-trigger
            )
              .then(async (imageResult) => {
                // Send image_ready SSE event (best effort -- client may have disconnected)
                try {
                  eventId++;
                  sendSSE(reply, eventId, 'image_ready', {
                    imageUrl: imageResult.imageUrl,
                    prompt: imageResult.prompt,
                    cached: imageResult.cached,
                    timestamp: Date.now(),
                  });
                } catch {
                  // Response already closed -- client will see the image via polling
                  logger.debug('Could not send image_ready SSE (response closed)', { sessionId });
                }
              })
              .catch((imgError) => {
                if (imgError instanceof ImageLimitError) {
                  logger.info('Image auto-trigger skipped: limit reached', { sessionId });
                } else {
                  logger.error('Image auto-trigger failed', { sessionId, error: imgError });
                }
              });
          }
        } catch {
          // fullNarration was not JSON (streaming mode) -- skip auto-trigger
        }

        // ---- POST-TURN: Summary generation (non-blocking) ----
        if (shouldGenerateSummary(updatedGameState.session.turnsPlayed)) {
          generateNarrativeSummary(sessionId, updatedGameState.character.name)
            .then(async (summary) => {
              if (summary) {
                await updateGameState(sessionId, { narrativeSummary: summary });
                logger.info('Narrative summary updated post-turn', { sessionId });
              }
            })
            .catch((err) => {
              logger.error('Post-turn summary generation failed', { sessionId, error: err });
            });
        }

        reply.raw.end();
      } catch (error) {
        // Send error event and close
        logger.error('Turn processing failed', { sessionId, turnId, error });

        // Track error in analytics
        trackError(
          error instanceof CircuitBreakerOpenError ? 'circuit_breaker_open' : 'turn_processing',
          `/session/${sessionId}/turn`,
          request.userId,
          error instanceof Error ? error.message : 'Unknown error',
        );

        try {
          await emit('error', {
            code: error instanceof CircuitBreakerOpenError ? 'SERVICE_UNAVAILABLE' : 'TURN_PROCESSING_ERROR',
            message: error instanceof Error ? error.message : 'An unexpected error occurred',
          });
        } catch {
          // SSE write failed, response may already be closed
        }
        reply.raw.end();
      }
    },
  );
}
