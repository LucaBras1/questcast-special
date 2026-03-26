import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { validateParams, validateBody } from '../middleware/validate.js';
import { sessionIdParamSchema, diceRollRequestSchema, llmDiceInterpretationSchema } from '../models/schemas.js';
import { getAIService } from '../ai/index.js';
import { TurnCostTracker } from '../services/cost-tracker.js';
import {
  getGameState,
  updateGameState,
  recordGameEvent,
  getSession,
  checkSessionTimeLimit,
} from '../services/game-service.js';
import { assembleSystemPrompt, assembleDicePrompt } from '../services/prompt-service.js';
import { synthesizeWithCache } from '../services/tts-cache.js';
import { getActiveCombat, processCombatAction } from '../services/combat-service.js';
import { logger } from '../utils/logger.js';
import type { DiceRollRequest } from '../../../shared/types/index.js';

/**
 * Dice type to max value mapping.
 */
const DICE_MAX: Record<string, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
};

/**
 * Determine difficulty class based on action type and game context.
 */
function determineDifficultyClass(
  actionType: string,
  threatLevel: string,
  _playerLevel: number,
): number {
  // Base DC by action type
  const baseDC: Record<string, number> = {
    attack: 10,
    defend: 8,
    spell: 12,
    stealth: 13,
    perception: 11,
    persuasion: 12,
    athletics: 10,
    acrobatics: 11,
    lockpick: 14,
    investigate: 12,
    flee: 10,
  };

  let dc = baseDC[actionType.toLowerCase()] ?? 12;

  // Adjust by threat level
  switch (threatLevel) {
    case 'critical':
      dc += 3;
      break;
    case 'high':
      dc += 2;
      break;
    case 'moderate':
      dc += 1;
      break;
    case 'low':
    default:
      break;
  }

  return dc;
}

export async function diceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  /**
   * POST /api/game/session/:id/dice
   *
   * Roll dice, get AI interpretation, apply state updates.
   */
  app.post(
    '/session/:id/dice',
    {
      schema: {
        tags: ['Dice'],
        summary: 'Roll dice with AI narration of the outcome',
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['diceType', 'actionType'],
          properties: {
            diceType: { type: 'string', enum: ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'] },
            actionType: { type: 'string', minLength: 1, maxLength: 50 },
            modifiers: { type: 'number', minimum: -20, maximum: 20, default: 0 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              rollValue: { type: 'number' },
              diceType: { type: 'string' },
              modifiers: { type: 'number' },
              total: { type: 'number' },
              difficultyClass: { type: 'number' },
              success: { type: 'boolean' },
              resultCategory: { type: 'string' },
              narration: { type: 'string' },
              audioUrl: { type: 'string' },
              stateUpdates: { type: 'object' },
              combat: { type: 'object' },
              cost: { type: 'object' },
            },
          },
        },
      },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          keyGenerator: (request: FastifyRequest) => {
            const params = request.params as { id: string };
            return `dice:${params.id}`;
          },
        },
      },
      preHandler: [
        validateParams(sessionIdParamSchema),
        validateBody(diceRollRequestSchema),
      ],
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: DiceRollRequest;
      }>,
      reply: FastifyReply,
    ) => {
      const sessionId = request.params.id;
      const { diceType, actionType, modifiers = 0 } = request.body;

      // Verify session ownership and status
      const session = await getSession(sessionId, request.userId);
      if (session.status !== 'active') {
        return reply.status(400).send({
          code: 'SESSION_NOT_ACTIVE',
          message: `Session is ${session.status}. Cannot roll dice.`,
        });
      }

      const gameState = await getGameState(sessionId);

      // Check session time limit
      const timeStatus = checkSessionTimeLimit(gameState);
      if (timeStatus === 'hard_limit') {
        return reply.status(400).send({
          code: 'SESSION_TIME_LIMIT',
          message: 'Session has reached the 60-minute hard time limit. Please complete or save the session.',
        });
      }

      const costTracker = new TurnCostTracker(sessionId, request.userId, gameState.session.turnsPlayed);

      // Generate random roll
      const maxValue = DICE_MAX[diceType];
      if (!maxValue) {
        return reply.status(400).send({
          code: 'INVALID_DICE_TYPE',
          message: `Invalid dice type: ${diceType}`,
        });
      }

      const rollValue = Math.floor(Math.random() * maxValue) + 1;
      const total = rollValue + modifiers;

      // Determine difficulty class
      const difficultyClass = determineDifficultyClass(
        actionType,
        gameState.world.threatLevel,
        gameState.character.level,
      );

      const success = total >= difficultyClass;

      // Determine result category for the prompt
      let resultCategory: string;
      if (diceType === 'd20') {
        if (rollValue === 20) resultCategory = 'critical_success';
        else if (rollValue === 1) resultCategory = 'critical_failure';
        else if (success) resultCategory = 'success';
        else resultCategory = 'failure';
      } else {
        resultCategory = success ? 'success' : 'failure';
      }

      // Check if we are in active combat
      const activeCombat = await getActiveCombat(sessionId);
      let combatResult = null;

      if (activeCombat) {
        // Process combat action with dice result
        const combatAction = actionType.toLowerCase() as 'attack' | 'defend' | 'spell' | 'flee';
        if (['attack', 'defend', 'spell', 'flee'].includes(combatAction)) {
          combatResult = await processCombatAction(sessionId, combatAction, {
            rollValue,
            total,
            success,
          });
        }
      }

      // Send roll + context to LLM for interpretation
      const dicePrompt = assembleDicePrompt(
        rollValue,
        diceType,
        actionType,
        difficultyClass,
        modifiers,
        resultCategory,
      );

      const aiService = getAIService();

      let narration = '';
      let stateUpdates: Record<string, unknown> = {};

      try {
        const systemPrompt = assembleSystemPrompt(
          'en',
          'teen',
          gameState,
          gameState.story.narrativeSummary,
        );

        const diceContext = combatResult
          ? `${dicePrompt}\n\nCombat context: Player dealt ${combatResult.playerDamageDealt} damage, received ${combatResult.playerDamageReceived} damage. Enemy health: ${combatResult.enemyHealth}. ${combatResult.combatEnded ? `Combat ended: ${combatResult.outcome}` : 'Combat continues.'}`
          : dicePrompt;

        const result = await aiService.generateNarration(
          systemPrompt,
          [{ role: 'user', content: diceContext }],
          gameState as unknown as Record<string, unknown>,
        );

        costTracker.addLLMCost(result.cost.llmInputCost, result.cost.llmOutputCost);

        // Parse the response
        try {
          const parsed = JSON.parse(result.text);
          const validated = llmDiceInterpretationSchema.safeParse(parsed);
          if (validated.success) {
            narration = validated.data.narration;
            if (validated.data.stateUpdates) {
              stateUpdates = {
                healthChange: validated.data.stateUpdates.healthChange,
                goldChange: validated.data.stateUpdates.goldChange,
                inventoryAdd: validated.data.stateUpdates.inventoryAdd,
                inventoryRemove: validated.data.stateUpdates.inventoryRemove,
              };
            }
          } else {
            narration = result.text;
          }
        } catch {
          narration = result.text;
        }
      } catch (aiError) {
        logger.error('Dice AI interpretation failed, using generic narration', { error: aiError });
        narration = success
          ? 'Your action succeeds! Fortune favors the bold.'
          : 'Your attempt falls short. The dice were not in your favor this time.';
      }

      // Apply state updates from AI response (only if not in combat, as combat handles its own state)
      if (Object.keys(stateUpdates).length > 0 && !activeCombat) {
        await updateGameState(sessionId, stateUpdates as Parameters<typeof updateGameState>[1]);
      }

      // Generate TTS for narration
      let audioUrl: string | undefined;
      try {
        const ttsResult = await synthesizeWithCache(narration);
        costTracker.addTTSCost(ttsResult.cost);
        // Return audio as base64 data URL
        audioUrl = `data:audio/opus;base64,${ttsResult.audioBase64}`;
      } catch (ttsError) {
        logger.error('TTS failed for dice narration', { error: ttsError });
      }

      // Record dice event
      const finalCost = costTracker.finalize();
      const updatedGameState = await getGameState(sessionId);

      await recordGameEvent(
        sessionId,
        updatedGameState.session.turnsPlayed,
        `[DICE ROLL] ${diceType} for ${actionType}: ${rollValue} + ${modifiers} = ${total} vs DC ${difficultyClass}`,
        narration,
        updatedGameState,
        finalCost,
      );

      return reply.send({
        rollValue,
        diceType,
        modifiers,
        total,
        difficultyClass,
        success,
        resultCategory,
        narration,
        audioUrl,
        stateUpdates,
        combat: combatResult
          ? {
              playerDamageDealt: combatResult.playerDamageDealt,
              playerDamageReceived: combatResult.playerDamageReceived,
              enemyHealth: combatResult.enemyHealth,
              playerHealth: combatResult.playerHealth,
              combatEnded: combatResult.combatEnded,
              outcome: combatResult.outcome,
              rewards: combatResult.rewards,
            }
          : undefined,
        cost: finalCost,
      });
    },
  );
}
