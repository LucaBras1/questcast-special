import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import type { GameState } from '../../../shared/types/index.js';
import type { ConversationEntry } from './redis.js';

/**
 * Prompt Assembly Service.
 * Loads prompt templates from the prompts/ directory at startup,
 * caches them in memory, and provides methods to assemble complete prompts
 * with variable injection.
 */

// ---- Template Cache ----

interface PromptTemplates {
  systemPromptEn: string;
  systemPromptCs: string;
  contentSafetyRules: string;
  sceneDescription: string;
  combat: string;
  diceInterpretation: string;
  conversationSummary: string;
  cliffhanger: string;
  recap: string;
  tutorial: string;
}

let _templates: PromptTemplates | null = null;

const PROMPTS_DIR = join(process.cwd(), '..', 'prompts');

function loadTemplate(filename: string): string {
  try {
    return readFileSync(join(PROMPTS_DIR, filename), 'utf-8');
  } catch (error) {
    logger.error(`Failed to load prompt template: ${filename}`, error);
    return '';
  }
}

/**
 * Load all prompt templates into memory. Call once at startup.
 */
export function loadPromptTemplates(): void {
  _templates = {
    systemPromptEn: loadTemplate('system_prompt_base_en.txt'),
    systemPromptCs: loadTemplate('system_prompt_base_cs.txt'),
    contentSafetyRules: loadTemplate('content_safety_rules.txt'),
    sceneDescription: loadTemplate('scene_description.txt'),
    combat: loadTemplate('combat.txt'),
    diceInterpretation: loadTemplate('dice_interpretation.txt'),
    conversationSummary: loadTemplate('conversation_summary.txt'),
    cliffhanger: loadTemplate('cliffhanger.txt'),
    recap: loadTemplate('recap.txt'),
    tutorial: loadTemplate('tutorial.txt'),
  };
  logger.info('Prompt templates loaded successfully');
}

function getTemplates(): PromptTemplates {
  if (!_templates) {
    loadPromptTemplates();
  }
  return _templates!;
}

// ---- Variable Injection ----

function injectVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

// ---- Game State Optimization ----

/**
 * Optimize game state for token efficiency.
 * Omits empty arrays, zero values, and session metadata unless near limits.
 */
function optimizeGameState(gameState: GameState): Record<string, unknown> {
  const optimized: Record<string, unknown> = {
    session_id: gameState.sessionId,
    character: {
      name: gameState.character.name,
      class: gameState.character.class,
      level: gameState.character.level,
      health: gameState.character.health,
      max_health: gameState.character.maxHealth,
      ...(gameState.character.inventory.length > 0 && {
        inventory: gameState.character.inventory,
      }),
      ...(gameState.character.gold > 0 && { gold: gameState.character.gold }),
      ...(gameState.character.abilities.length > 0 && {
        abilities: gameState.character.abilities,
      }),
    },
    story: {
      current_location: gameState.story.currentLocation,
      active_quest: gameState.story.activeQuest,
      quest_progress: gameState.story.questProgress,
      ...(gameState.story.currentChapter > 1 && {
        current_chapter: gameState.story.currentChapter,
      }),
      ...(gameState.story.npcsMet.length > 0 && {
        npcs_met: gameState.story.npcsMet,
      }),
      ...(gameState.story.keyDecisions.length > 0 && {
        key_decisions: gameState.story.keyDecisions.slice(-5), // Last 5 decisions max
      }),
    },
    world: {
      time_of_day: gameState.world.timeOfDay,
      ...(gameState.world.weather !== 'clear' && { weather: gameState.world.weather }),
      threat_level: gameState.world.threatLevel,
    },
  };

  // Only include session metadata when near limits
  if (gameState.session.turnsPlayed > 50 || gameState.session.timeElapsedMinutes > 40) {
    (optimized as Record<string, unknown>).session = {
      turns_played: gameState.session.turnsPlayed,
      time_elapsed_minutes: gameState.session.timeElapsedMinutes,
    };
  }

  return optimized;
}

// ---- Public API ----

/**
 * Assemble the full system prompt for the DM.
 */
export function assembleSystemPrompt(
  language: 'cs' | 'en',
  contentRating: 'family' | 'teen' | 'mature',
  gameState: GameState,
  narrativeSummary: string,
): string {
  const templates = getTemplates();
  const basePrompt = language === 'cs' ? templates.systemPromptCs : templates.systemPromptEn;

  const optimizedState = optimizeGameState(gameState);

  return injectVariables(basePrompt, {
    narrator_style: 'epic',
    difficulty_level: 'standard',
    content_rating: contentRating,
    content_safety_rules: templates.contentSafetyRules,
    game_state_json: JSON.stringify(optimizedState, null, 2),
    narrative_summary: narrativeSummary || 'No previous summary. This is the beginning of the adventure.',
    conversation_history: '', // Conversation history is passed separately as messages
  });
}

/**
 * Assemble the user turn message with player input.
 */
export function assembleTurnPrompt(
  playerInput: string,
  _conversationHistory: ConversationEntry[],
): string {
  // The conversation history is passed as chat messages, not embedded in the prompt.
  // This function wraps the player input with any additional context needed.
  return playerInput;
}

/**
 * Format conversation history for the LLM chat messages array.
 */
export function formatConversationHistory(
  history: ConversationEntry[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));
}

/**
 * Assemble a scene description prompt for a new location.
 */
export function assembleScenePrompt(
  location: string,
  timeOfDay: string,
  weather: string,
  threatLevel: string,
): string {
  const templates = getTemplates();
  return injectVariables(templates.sceneDescription, {
    location,
    time_of_day: timeOfDay,
    weather,
    threat_level: threatLevel,
  });
}

/**
 * Assemble a combat initiation prompt.
 */
export function assembleCombatPrompt(
  enemyType: string,
  enemyStats: string,
  difficultyLevel: string,
  playerStats: string,
): string {
  const templates = getTemplates();
  return injectVariables(templates.combat, {
    enemy_type: enemyType,
    enemy_stats: enemyStats,
    difficulty_level: difficultyLevel,
    player_stats: playerStats,
  });
}

/**
 * Assemble a dice roll interpretation prompt.
 */
export function assembleDicePrompt(
  rollValue: number,
  diceType: string,
  actionType: string,
  dc: number,
  modifiers: number,
  result: string,
): string {
  const templates = getTemplates();
  return injectVariables(templates.diceInterpretation, {
    roll_value: String(rollValue),
    dice_type: diceType,
    action_type: actionType,
    difficulty_class: String(dc),
    modifiers: String(modifiers),
    final_result: result,
  });
}

/**
 * Get the conversation summary prompt template with recent turns injected.
 */
export function assembleSummaryPrompt(recentTurns: string): string {
  const templates = getTemplates();
  return injectVariables(templates.conversationSummary, {
    recent_turns: recentTurns,
  });
}

/**
 * Assemble a recap prompt for session resume.
 */
export function assembleRecapPrompt(
  characterName: string,
  currentLocation: string,
  activeQuest: string,
  narrativeSummary: string,
): string {
  const templates = getTemplates();
  return injectVariables(templates.recap, {
    character_name: characterName,
    current_location: currentLocation,
    active_quest: activeQuest,
    narrative_summary: narrativeSummary || 'The adventure is just beginning.',
  });
}
