import { v4 as uuidv4 } from 'uuid';
import { getGameState, updateGameState } from './game-service.js';
import { logger } from '../utils/logger.js';

/**
 * Combat Service.
 *
 * Manages combat encounters: initiation, action processing, and resolution.
 * Combat is designed to be quick (2-4 turns typical) and dramatic.
 */

// ---- Enemy Definitions ----

export interface EnemyStats {
  name: string;
  type: string;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  xpReward: number;
  goldReward: number;
  abilities: string[];
}

interface EnemyTemplate {
  baseHealth: number;
  baseAttack: number;
  baseDefense: number;
  baseXP: number;
  baseGold: number;
  abilities: string[];
  displayName: string;
}

const ENEMY_TEMPLATES: Record<string, EnemyTemplate> = {
  goblin: {
    baseHealth: 15,
    baseAttack: 4,
    baseDefense: 2,
    baseXP: 20,
    baseGold: 5,
    abilities: ['quick_stab'],
    displayName: 'Goblin',
  },
  skeleton: {
    baseHealth: 20,
    baseAttack: 5,
    baseDefense: 3,
    baseXP: 25,
    baseGold: 8,
    abilities: ['bone_strike', 'reassemble'],
    displayName: 'Skeleton',
  },
  bandit: {
    baseHealth: 25,
    baseAttack: 6,
    baseDefense: 3,
    baseXP: 30,
    baseGold: 15,
    abilities: ['ambush', 'dirty_trick'],
    displayName: 'Bandit',
  },
  wolf: {
    baseHealth: 18,
    baseAttack: 7,
    baseDefense: 2,
    baseXP: 22,
    baseGold: 3,
    abilities: ['bite', 'pack_howl'],
    displayName: 'Wolf',
  },
  troll: {
    baseHealth: 40,
    baseAttack: 8,
    baseDefense: 5,
    baseXP: 50,
    baseGold: 25,
    abilities: ['smash', 'regenerate'],
    displayName: 'Troll',
  },
};

// ---- Combat State (stored in Redis alongside game state) ----

export interface CombatState {
  active: boolean;
  combatId: string;
  enemy: EnemyStats;
  turnCount: number;
  playerInitiative: boolean;
  log: CombatLogEntry[];
}

export interface CombatLogEntry {
  turn: number;
  actor: 'player' | 'enemy';
  action: string;
  damage: number;
  narration: string;
}

export type CombatAction = 'attack' | 'defend' | 'spell' | 'flee';

export interface CombatActionResult {
  action: CombatAction;
  playerDamageDealt: number;
  playerDamageReceived: number;
  enemyHealth: number;
  playerHealth: number;
  combatEnded: boolean;
  outcome?: 'victory' | 'defeat' | 'fled';
  rewards?: { xp: number; gold: number };
  narrationContext: string;
}

// ---- Redis keys for combat state ----

const COMBAT_STATE_KEY = (sessionId: string) => `session:${sessionId}:combat`;

// We store combat state directly in the game state's world section
// and use a separate Redis key for detailed combat tracking

import { getRedis, isRedisAvailable } from './redis.js';

async function getCombatState(sessionId: string): Promise<CombatState | null> {
  if (!(await isRedisAvailable())) return null;
  try {
    const redis = getRedis();
    return await redis.get<CombatState>(COMBAT_STATE_KEY(sessionId));
  } catch (error) {
    logger.error('Failed to get combat state', { sessionId, error });
    return null;
  }
}

async function setCombatState(sessionId: string, state: CombatState): Promise<void> {
  if (!(await isRedisAvailable())) return;
  try {
    const redis = getRedis();
    await redis.set(COMBAT_STATE_KEY(sessionId), state, { ex: 7200 });
  } catch (error) {
    logger.error('Failed to set combat state', { sessionId, error });
  }
}

async function clearCombatState(sessionId: string): Promise<void> {
  if (!(await isRedisAvailable())) return;
  try {
    const redis = getRedis();
    await redis.del(COMBAT_STATE_KEY(sessionId));
  } catch (error) {
    logger.error('Failed to clear combat state', { sessionId, error });
  }
}

// ---- Public API ----

/**
 * Generate enemy stats based on type and player level.
 */
export function generateEnemyStats(
  enemyType: string,
  playerLevel: number,
): EnemyStats {
  const template = ENEMY_TEMPLATES[enemyType];
  if (!template) {
    // Default to goblin if unknown type
    return generateEnemyStats('goblin', playerLevel);
  }

  // Scale stats by player level (linear scaling with diminishing returns)
  const levelMultiplier = 1 + (playerLevel - 1) * 0.15;

  return {
    name: template.displayName,
    type: enemyType,
    health: Math.round(template.baseHealth * levelMultiplier),
    maxHealth: Math.round(template.baseHealth * levelMultiplier),
    attack: Math.round(template.baseAttack * levelMultiplier),
    defense: Math.round(template.baseDefense * levelMultiplier),
    xpReward: Math.round(template.baseXP * levelMultiplier),
    goldReward: Math.round(template.baseGold * levelMultiplier),
    abilities: template.abilities,
  };
}

/**
 * Initiate combat with an enemy.
 * Sets world.threatLevel to 'critical' and creates combat state.
 */
export async function initiateCombat(
  sessionId: string,
  enemyType: string,
): Promise<{ combatId: string; enemy: EnemyStats }> {
  const gameState = await getGameState(sessionId);
  const playerLevel = gameState.character.level;

  const enemy = generateEnemyStats(enemyType, playerLevel);
  const combatId = uuidv4();

  const combatState: CombatState = {
    active: true,
    combatId,
    enemy,
    turnCount: 0,
    playerInitiative: Math.random() > 0.4, // 60% chance player goes first
    log: [],
  };

  await setCombatState(sessionId, combatState);

  // Update game state threat level
  await updateGameState(sessionId, { threatLevel: 'critical' });

  logger.info('Combat initiated', {
    sessionId,
    combatId,
    enemyType,
    enemyHealth: enemy.health,
    playerLevel,
  });

  return { combatId, enemy };
}

/**
 * Process a combat action with a dice result.
 * Calculates damage based on roll + class abilities.
 */
export async function processCombatAction(
  sessionId: string,
  action: CombatAction,
  diceResult: { rollValue: number; total: number; success: boolean },
): Promise<CombatActionResult> {
  const combatState = await getCombatState(sessionId);
  if (!combatState || !combatState.active) {
    throw new Error('No active combat in this session');
  }

  const gameState = await getGameState(sessionId);
  const character = gameState.character;
  const enemy = combatState.enemy;

  combatState.turnCount++;

  let playerDamageDealt = 0;
  let playerDamageReceived = 0;
  let narrationContext = '';

  switch (action) {
    case 'attack': {
      if (diceResult.success) {
        // Base damage from roll + class modifier
        playerDamageDealt = Math.max(1, diceResult.total - enemy.defense);

        // Critical hits (roll of 20 on d20) do double damage
        if (diceResult.rollValue === 20) {
          playerDamageDealt *= 2;
          narrationContext = 'critical_hit';
        } else {
          narrationContext = 'hit';
        }
      } else {
        playerDamageDealt = 0;
        narrationContext = 'miss';
      }

      // Enemy counter-attack (reduced if player hit hard)
      const enemyAttackRoll = Math.floor(Math.random() * 20) + 1;
      if (enemyAttackRoll > 8) {
        playerDamageReceived = Math.max(1, enemy.attack - Math.floor(character.level * 0.5));
      }
      break;
    }

    case 'defend': {
      // Defending reduces incoming damage significantly
      const enemyAttackRoll = Math.floor(Math.random() * 20) + 1;
      if (enemyAttackRoll > 12) {
        playerDamageReceived = Math.max(0, Math.floor(enemy.attack * 0.3));
      }
      narrationContext = 'defend';
      break;
    }

    case 'spell': {
      if (diceResult.success) {
        // Spells do more damage but require success
        playerDamageDealt = Math.max(1, Math.floor(diceResult.total * 1.5) - Math.floor(enemy.defense * 0.5));

        if (diceResult.rollValue === 20) {
          playerDamageDealt *= 2;
          narrationContext = 'critical_spell';
        } else {
          narrationContext = 'spell_hit';
        }
      } else {
        narrationContext = 'spell_fizzle';
        // Failed spell leaves player vulnerable
        const enemyAttackRoll = Math.floor(Math.random() * 20) + 1;
        if (enemyAttackRoll > 6) {
          playerDamageReceived = Math.max(1, enemy.attack);
        }
      }
      break;
    }

    case 'flee': {
      if (diceResult.success) {
        narrationContext = 'flee_success';
        // Successfully fled -- end combat without rewards
        combatState.active = false;
        await setCombatState(sessionId, combatState);
        await endCombat(sessionId, 'fled');

        return {
          action,
          playerDamageDealt: 0,
          playerDamageReceived: 0,
          enemyHealth: enemy.health,
          playerHealth: character.health,
          combatEnded: true,
          outcome: 'fled',
          narrationContext,
        };
      } else {
        narrationContext = 'flee_fail';
        // Failed flee: enemy gets a free attack
        playerDamageReceived = Math.max(1, enemy.attack);
      }
      break;
    }
  }

  // Apply damage to enemy
  combatState.enemy.health = Math.max(0, combatState.enemy.health - playerDamageDealt);

  // Apply damage to player via game state
  const newPlayerHealth = Math.max(0, character.health - playerDamageReceived);

  // Log the combat turn
  combatState.log.push({
    turn: combatState.turnCount,
    actor: 'player',
    action,
    damage: playerDamageDealt,
    narration: narrationContext,
  });

  if (playerDamageReceived > 0) {
    combatState.log.push({
      turn: combatState.turnCount,
      actor: 'enemy',
      action: 'counter_attack',
      damage: playerDamageReceived,
      narration: 'enemy_attacks',
    });
  }

  // Check for combat end conditions
  let combatEnded = false;
  let outcome: 'victory' | 'defeat' | undefined;
  let rewards: { xp: number; gold: number } | undefined;

  if (combatState.enemy.health <= 0) {
    // Enemy defeated
    combatEnded = true;
    outcome = 'victory';
    rewards = { xp: enemy.xpReward, gold: enemy.goldReward };
    combatState.active = false;
  } else if (newPlayerHealth <= 0) {
    // Player defeated
    combatEnded = true;
    outcome = 'defeat';
    combatState.active = false;
  }

  // Update states
  await setCombatState(sessionId, combatState);

  // Update player health in game state
  if (playerDamageReceived > 0) {
    await updateGameState(sessionId, { healthChange: -playerDamageReceived });
  }

  if (combatEnded) {
    await endCombat(sessionId, outcome!);

    // Award rewards on victory
    if (outcome === 'victory' && rewards) {
      await updateGameState(sessionId, { goldChange: rewards.gold });
    }
  }

  logger.info('Combat action processed', {
    sessionId,
    combatId: combatState.combatId,
    action,
    playerDamageDealt,
    playerDamageReceived,
    enemyHealth: combatState.enemy.health,
    playerHealth: newPlayerHealth,
    combatEnded,
    outcome,
  });

  return {
    action,
    playerDamageDealt,
    playerDamageReceived,
    enemyHealth: combatState.enemy.health,
    playerHealth: newPlayerHealth,
    combatEnded,
    outcome,
    rewards,
    narrationContext,
  };
}

/**
 * End combat and clean up state.
 */
export async function endCombat(
  sessionId: string,
  outcome: 'victory' | 'defeat' | 'fled',
): Promise<void> {
  // Restore threat level based on outcome
  const threatLevel = outcome === 'defeat' ? 'high' : 'low';
  await updateGameState(sessionId, { threatLevel });

  await clearCombatState(sessionId);

  logger.info('Combat ended', { sessionId, outcome });
}

/**
 * Get the current combat state for a session (if active).
 */
export async function getActiveCombat(sessionId: string): Promise<CombatState | null> {
  const state = await getCombatState(sessionId);
  if (!state || !state.active) return null;
  return state;
}

/**
 * Get available enemy types.
 */
export function getEnemyTypes(): string[] {
  return Object.keys(ENEMY_TEMPLATES);
}
