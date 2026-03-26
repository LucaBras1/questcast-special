import { prisma } from './prisma.js';
import { getGameState } from './game-service.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { CharacterClass } from '../../../shared/types/index.js';

/**
 * Character Service.
 *
 * Manages character creation, stats, inventory, gold, and leveling.
 * Characters are persisted in PostgreSQL and their runtime state
 * lives in the GameState stored in Redis.
 */

// ---- Class Starting Stats ----

export interface ClassStartingStats {
  health: number;
  maxHealth: number;
  inventory: string[];
  abilities: string[];
  gold: number;
}

export const CLASS_STARTING_STATS: Record<CharacterClass, ClassStartingStats> = {
  warrior: {
    health: 50,
    maxHealth: 50,
    inventory: ['sword', 'shield'],
    abilities: ['power_strike', 'defensive_stance'],
    gold: 10,
  },
  mage: {
    health: 30,
    maxHealth: 30,
    inventory: ['staff', 'spellbook'],
    abilities: ['fireball', 'arcane_shield'],
    gold: 15,
  },
  rogue: {
    health: 35,
    maxHealth: 35,
    inventory: ['dagger', 'lockpicks'],
    abilities: ['backstab', 'stealth'],
    gold: 20,
  },
  ranger: {
    health: 40,
    maxHealth: 40,
    inventory: ['bow', 'arrows', 'hunting_knife'],
    abilities: ['precise_shot', 'track'],
    gold: 12,
  },
};

const MAX_INVENTORY_SIZE = 20;
const HP_PER_LEVEL = 5;

// ---- Public API ----

/**
 * Create a character with class-based starting stats.
 */
export async function createCharacter(
  userId: string,
  name: string,
  characterClass: CharacterClass,
): Promise<{
  id: string;
  name: string;
  class: CharacterClass;
  level: number;
  health: number;
  maxHealth: number;
  inventory: string[];
  gold: number;
  abilities: string[];
}> {
  const stats = CLASS_STARTING_STATS[characterClass];

  const character = await prisma.character.create({
    data: {
      userId,
      name,
      class: characterClass,
      level: 1,
      health: stats.health,
      maxHealth: stats.maxHealth,
      inventory: stats.inventory,
      gold: stats.gold,
      abilities: stats.abilities,
    },
  });

  logger.info('Character created', {
    characterId: character.id,
    userId,
    name,
    class: characterClass,
    startingHP: stats.health,
  });

  return {
    id: character.id,
    name: character.name,
    class: character.class as CharacterClass,
    level: character.level,
    health: character.health,
    maxHealth: character.maxHealth,
    inventory: character.inventory as string[],
    gold: character.gold,
    abilities: character.abilities as string[],
  };
}

/**
 * Update character health by delta. Clamps to [0, maxHealth].
 * Returns whether a death save was triggered (health reached 0).
 */
export async function updateHealth(
  characterId: string,
  delta: number,
): Promise<{ health: number; maxHealth: number; deathSaveTriggered: boolean }> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    throw new NotFoundError('Character', characterId);
  }

  const newHealth = Math.max(0, Math.min(character.maxHealth, character.health + delta));
  const deathSaveTriggered = newHealth === 0 && character.health > 0;

  await prisma.character.update({
    where: { id: characterId },
    data: { health: newHealth },
  });

  if (deathSaveTriggered) {
    logger.warn('Death save triggered', { characterId, previousHealth: character.health });
  }

  logger.info('Character health updated', {
    characterId,
    delta,
    previousHealth: character.health,
    newHealth,
    deathSaveTriggered,
  });

  return {
    health: newHealth,
    maxHealth: character.maxHealth,
    deathSaveTriggered,
  };
}

/**
 * Add items to character inventory. Enforces max 20 items.
 */
export async function addToInventory(
  characterId: string,
  items: string[],
): Promise<{ inventory: string[] }> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    throw new NotFoundError('Character', characterId);
  }

  const currentInventory = character.inventory as string[];
  const totalAfterAdd = currentInventory.length + items.length;

  if (totalAfterAdd > MAX_INVENTORY_SIZE) {
    throw new ValidationError(
      `Inventory full. Current: ${currentInventory.length}, adding: ${items.length}, max: ${MAX_INVENTORY_SIZE}`,
      { currentSize: currentInventory.length, addingCount: items.length, maxSize: MAX_INVENTORY_SIZE },
    );
  }

  const newInventory = [...currentInventory, ...items];

  await prisma.character.update({
    where: { id: characterId },
    data: { inventory: newInventory },
  });

  logger.info('Items added to inventory', { characterId, items, inventorySize: newInventory.length });

  return { inventory: newInventory };
}

/**
 * Remove items from character inventory. Errors if item not found.
 */
export async function removeFromInventory(
  characterId: string,
  items: string[],
): Promise<{ inventory: string[] }> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    throw new NotFoundError('Character', characterId);
  }

  const currentInventory = [...(character.inventory as string[])];

  for (const item of items) {
    const index = currentInventory.indexOf(item);
    if (index === -1) {
      throw new ValidationError(
        `Item '${item}' not found in inventory`,
        { item, inventory: currentInventory },
      );
    }
    currentInventory.splice(index, 1);
  }

  await prisma.character.update({
    where: { id: characterId },
    data: { inventory: currentInventory },
  });

  logger.info('Items removed from inventory', { characterId, items, inventorySize: currentInventory.length });

  return { inventory: currentInventory };
}

/**
 * Update character gold by delta. Floors at 0.
 */
export async function updateGold(
  characterId: string,
  delta: number,
): Promise<{ gold: number }> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    throw new NotFoundError('Character', characterId);
  }

  const newGold = Math.max(0, character.gold + delta);

  await prisma.character.update({
    where: { id: characterId },
    data: { gold: newGold },
  });

  logger.info('Character gold updated', {
    characterId,
    delta,
    previousGold: character.gold,
    newGold,
  });

  return { gold: newGold };
}

/**
 * Level up a character: increment level, increase maxHealth by 5, restore health to max.
 */
export async function levelUp(
  characterId: string,
): Promise<{ level: number; health: number; maxHealth: number }> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    throw new NotFoundError('Character', characterId);
  }

  const newLevel = character.level + 1;
  const newMaxHealth = character.maxHealth + HP_PER_LEVEL;

  await prisma.character.update({
    where: { id: characterId },
    data: {
      level: newLevel,
      maxHealth: newMaxHealth,
      health: newMaxHealth, // Restore to full
    },
  });

  logger.info('Character leveled up', {
    characterId,
    previousLevel: character.level,
    newLevel,
    newMaxHealth,
  });

  return {
    level: newLevel,
    health: newMaxHealth,
    maxHealth: newMaxHealth,
  };
}

/**
 * Get full character data.
 */
export async function getCharacter(
  characterId: string,
): Promise<{
  id: string;
  userId: string;
  name: string;
  class: CharacterClass;
  level: number;
  health: number;
  maxHealth: number;
  inventory: string[];
  gold: number;
  abilities: string[];
}> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
  });

  if (!character) {
    throw new NotFoundError('Character', characterId);
  }

  return {
    id: character.id,
    userId: character.userId,
    name: character.name,
    class: character.class as CharacterClass,
    level: character.level,
    health: character.health,
    maxHealth: character.maxHealth,
    inventory: character.inventory as string[],
    gold: character.gold,
    abilities: character.abilities as string[],
  };
}

/**
 * Sync character state from a game session's GameState back to the Character record.
 * Used during save operations.
 */
export async function syncCharacterFromGameState(
  sessionId: string,
): Promise<void> {
  const gameState = await getGameState(sessionId);
  const charState = gameState.character;

  if (!charState.id) return;

  await prisma.character.update({
    where: { id: charState.id },
    data: {
      level: charState.level,
      health: charState.health,
      maxHealth: charState.maxHealth,
      inventory: charState.inventory,
      gold: charState.gold,
      abilities: charState.abilities,
    },
  });

  logger.info('Character synced from game state', {
    characterId: charState.id,
    sessionId,
  });
}
