import { getAIService } from '../ai/index.js';
import { logger } from '../utils/logger.js';
import { assembleSummaryPrompt } from './prompt-service.js';
import type { ConversationEntry } from './redis.js';
import { getHistory } from './redis.js';
import { llmSummarySchema } from '../models/schemas.js';
import { SUMMARY_EVERY_N_TURNS } from '../../../shared/constants/index.js';

/**
 * Conversation Summary Service.
 *
 * Every SUMMARY_EVERY_N_TURNS turns, generates a narrative summary
 * of the recent conversation. This summary is stored in
 * gameState.story.narrativeSummary and used as the AI's "long-term memory".
 *
 * The summary runs AFTER the turn response is sent -- it does NOT block
 * the player's experience.
 */

/**
 * Check if a summary should be triggered for this turn number.
 */
export function shouldGenerateSummary(turnsPlayed: number): boolean {
  return turnsPlayed > 0 && turnsPlayed % SUMMARY_EVERY_N_TURNS === 0;
}

/**
 * Format conversation entries into a readable string for the summary prompt.
 */
function formatTurnsForSummary(entries: ConversationEntry[]): string {
  return entries
    .map((e) => {
      const speaker = e.role === 'user' ? 'PLAYER' : 'DM';
      return `[Turn ${e.turnNumber}] ${speaker}: ${e.content}`;
    })
    .join('\n\n');
}

/**
 * Generate a narrative summary of the last N turns.
 * This runs asynchronously and should NOT block the turn response.
 *
 * @returns The summary text, or null if generation fails.
 */
export async function generateNarrativeSummary(
  sessionId: string,
  characterName: string,
): Promise<string | null> {
  try {
    const history = await getHistory(sessionId, SUMMARY_EVERY_N_TURNS);

    if (history.length === 0) {
      logger.warn('No conversation history for summary generation', { sessionId });
      return null;
    }

    const formattedTurns = formatTurnsForSummary(history);
    const summaryPrompt = assembleSummaryPrompt(formattedTurns);

    const aiService = getAIService();

    // Use the non-streaming narration method with a specific summary system prompt
    const result = await aiService.generateNarration(
      `You are a concise narrative summarizer. The player character's name is "${characterName}". Generate a summary as instructed.`,
      [{ role: 'user', content: summaryPrompt }],
      {},
    );

    // Try to parse as JSON with our schema
    let summaryText: string;
    try {
      const parsed = JSON.parse(result.text);
      const validated = llmSummarySchema.parse(parsed);
      summaryText = validated.summary;
    } catch {
      // Fallback: use the raw text (LLM might not have returned JSON for this)
      summaryText = result.text;
    }

    // Ensure summary is not too long (120 tokens ~ 90 words ~ 500 chars)
    if (summaryText.length > 600) {
      summaryText = summaryText.slice(0, 597) + '...';
    }

    logger.info('Narrative summary generated', {
      sessionId,
      summaryLength: summaryText.length,
      historyEntriesUsed: history.length,
      cost: result.cost,
    });

    return summaryText;
  } catch (error) {
    logger.error('Failed to generate narrative summary', { sessionId, error });
    return null;
  }
}
