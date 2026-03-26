/**
 * Character Service -- Test Suite
 *
 * Tests for:
 * - Character creation per class (correct starting stats)
 * - HP management (damage, heal, clamp, death save)
 * - Inventory CRUD (add, remove, max limit)
 * - Gold management
 * - Level up
 */

import '../setup';

// ---- Mock Prisma ----

const mockCharacter = {
  id: 'char-001',
  userId: 'user-001',
  name: 'Thorin',
  class: 'warrior',
  level: 1,
  health: 50,
  maxHealth: 50,
  inventory: ['sword', 'shield'],
  gold: 10,
  abilities: ['power_strike', 'defensive_stance'],
};

let storedCharacter = { ...mockCharacter };

jest.mock('../../src/services/prisma', () => ({
  prisma: {
    character: {
      create: jest.fn((args: { data: Record<string, unknown> }) => {
        storedCharacter = {
          id: 'char-001',
          ...args.data,
        } as typeof mockCharacter;
        return Promise.resolve(storedCharacter);
      }),
      findUnique: jest.fn(() => Promise.resolve({ ...storedCharacter })),
      update: jest.fn((args: { data: Record<string, unknown> }) => {
        storedCharacter = { ...storedCharacter, ...args.data } as typeof mockCharacter;
        return Promise.resolve(storedCharacter);
      }),
    },
  },
}));

// Mock game-service (for syncCharacterFromGameState)
jest.mock('../../src/services/game-service', () => ({
  getGameState: jest.fn(() =>
    Promise.resolve({
      character: { ...storedCharacter },
    }),
  ),
  updateGameState: jest.fn(),
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  createCharacter,
  updateHealth,
  addToInventory,
  removeFromInventory,
  updateGold,
  levelUp,
  getCharacter,
  CLASS_STARTING_STATS,
} from '../../src/services/character-service';

import { prisma } from '../../src/services/prisma';

// ---- Helpers ----

function resetCharacter(overrides: Partial<typeof mockCharacter> = {}) {
  storedCharacter = { ...mockCharacter, ...overrides };
}

// ---- Tests ----

describe('CharacterService', () => {
  beforeEach(() => {
    resetCharacter();
    jest.clearAllMocks();
  });

  // ========== Character Creation ==========

  describe('createCharacter', () => {
    it('should create a warrior with correct starting stats', async () => {
      const result = await createCharacter('user-001', 'Thorin', 'warrior');

      expect(result.class).toBe('warrior');
      expect(result.level).toBe(1);
      expect(result.health).toBe(50);
      expect(result.maxHealth).toBe(50);
      expect(result.inventory).toEqual(['sword', 'shield']);
      expect(result.gold).toBe(10);
      expect(result.abilities).toEqual(['power_strike', 'defensive_stance']);
    });

    it('should create a mage with correct starting stats', async () => {
      const result = await createCharacter('user-001', 'Gandalf', 'mage');

      expect(result.class).toBe('mage');
      expect(result.health).toBe(30);
      expect(result.maxHealth).toBe(30);
      expect(result.inventory).toEqual(['staff', 'spellbook']);
      expect(result.gold).toBe(15);
      expect(result.abilities).toEqual(['fireball', 'arcane_shield']);
    });

    it('should create a rogue with correct starting stats', async () => {
      const result = await createCharacter('user-001', 'Shadow', 'rogue');

      expect(result.class).toBe('rogue');
      expect(result.health).toBe(35);
      expect(result.maxHealth).toBe(35);
      expect(result.inventory).toEqual(['dagger', 'lockpicks']);
      expect(result.gold).toBe(20);
      expect(result.abilities).toEqual(['backstab', 'stealth']);
    });

    it('should create a ranger with correct starting stats', async () => {
      const result = await createCharacter('user-001', 'Legolas', 'ranger');

      expect(result.class).toBe('ranger');
      expect(result.health).toBe(40);
      expect(result.maxHealth).toBe(40);
      expect(result.inventory).toEqual(['bow', 'arrows', 'hunting_knife']);
      expect(result.gold).toBe(12);
      expect(result.abilities).toEqual(['precise_shot', 'track']);
    });

    it('should call prisma.character.create with correct data', async () => {
      await createCharacter('user-001', 'Thorin', 'warrior');

      expect(prisma.character.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-001',
          name: 'Thorin',
          class: 'warrior',
          level: 1,
          health: 50,
          maxHealth: 50,
        }),
      });
    });

    it('should have starting stats defined for all four classes', () => {
      expect(CLASS_STARTING_STATS).toHaveProperty('warrior');
      expect(CLASS_STARTING_STATS).toHaveProperty('mage');
      expect(CLASS_STARTING_STATS).toHaveProperty('rogue');
      expect(CLASS_STARTING_STATS).toHaveProperty('ranger');
    });
  });

  // ========== HP Management ==========

  describe('updateHealth', () => {
    it('should apply damage correctly', async () => {
      resetCharacter({ health: 50, maxHealth: 50 });

      const result = await updateHealth('char-001', -15);

      expect(result.health).toBe(35);
      expect(result.deathSaveTriggered).toBe(false);
    });

    it('should apply healing correctly', async () => {
      resetCharacter({ health: 20, maxHealth: 50 });

      const result = await updateHealth('char-001', 10);

      expect(result.health).toBe(30);
      expect(result.deathSaveTriggered).toBe(false);
    });

    it('should clamp health to maxHealth on overheal', async () => {
      resetCharacter({ health: 45, maxHealth: 50 });

      const result = await updateHealth('char-001', 20);

      expect(result.health).toBe(50);
      expect(result.maxHealth).toBe(50);
    });

    it('should clamp health to 0 on lethal damage', async () => {
      resetCharacter({ health: 10, maxHealth: 50 });

      const result = await updateHealth('char-001', -100);

      expect(result.health).toBe(0);
    });

    it('should trigger death save when health reaches 0', async () => {
      resetCharacter({ health: 5, maxHealth: 50 });

      const result = await updateHealth('char-001', -10);

      expect(result.health).toBe(0);
      expect(result.deathSaveTriggered).toBe(true);
    });

    it('should NOT trigger death save if already at 0', async () => {
      resetCharacter({ health: 0, maxHealth: 50 });

      const result = await updateHealth('char-001', -5);

      expect(result.health).toBe(0);
      expect(result.deathSaveTriggered).toBe(false);
    });

    it('should throw NotFoundError for non-existent character', async () => {
      (prisma.character.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(updateHealth('non-existent', -5)).rejects.toThrow('not found');
    });
  });

  // ========== Inventory CRUD ==========

  describe('addToInventory', () => {
    it('should add items to inventory', async () => {
      resetCharacter({ inventory: ['sword', 'shield'] });

      const result = await addToInventory('char-001', ['potion', 'key']);

      expect(result.inventory).toEqual(['sword', 'shield', 'potion', 'key']);
    });

    it('should reject when inventory would exceed max size (20)', async () => {
      const fullInventory = Array.from({ length: 19 }, (_, i) => `item-${i}`);
      resetCharacter({ inventory: fullInventory });

      await expect(
        addToInventory('char-001', ['item-19', 'item-20']),
      ).rejects.toThrow('Inventory full');
    });

    it('should allow adding up to exactly 20 items', async () => {
      const inventory = Array.from({ length: 18 }, (_, i) => `item-${i}`);
      resetCharacter({ inventory });

      const result = await addToInventory('char-001', ['item-18', 'item-19']);

      expect(result.inventory.length).toBe(20);
    });

    it('should throw NotFoundError for non-existent character', async () => {
      (prisma.character.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(addToInventory('non-existent', ['item'])).rejects.toThrow('not found');
    });
  });

  describe('removeFromInventory', () => {
    it('should remove items from inventory', async () => {
      resetCharacter({ inventory: ['sword', 'shield', 'potion'] });

      const result = await removeFromInventory('char-001', ['potion']);

      expect(result.inventory).toEqual(['sword', 'shield']);
    });

    it('should remove only the first occurrence of a duplicate item', async () => {
      resetCharacter({ inventory: ['potion', 'sword', 'potion'] });

      const result = await removeFromInventory('char-001', ['potion']);

      expect(result.inventory).toEqual(['sword', 'potion']);
    });

    it('should throw ValidationError when removing an item not in inventory', async () => {
      resetCharacter({ inventory: ['sword', 'shield'] });

      await expect(
        removeFromInventory('char-001', ['nonexistent_item']),
      ).rejects.toThrow("Item 'nonexistent_item' not found in inventory");
    });

    it('should throw NotFoundError for non-existent character', async () => {
      (prisma.character.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(removeFromInventory('non-existent', ['item'])).rejects.toThrow('not found');
    });
  });

  // ========== Gold Management ==========

  describe('updateGold', () => {
    it('should add gold correctly', async () => {
      resetCharacter({ gold: 10 });

      const result = await updateGold('char-001', 25);

      expect(result.gold).toBe(35);
    });

    it('should subtract gold correctly', async () => {
      resetCharacter({ gold: 30 });

      const result = await updateGold('char-001', -15);

      expect(result.gold).toBe(15);
    });

    it('should floor gold at 0 (no negative gold)', async () => {
      resetCharacter({ gold: 5 });

      const result = await updateGold('char-001', -100);

      expect(result.gold).toBe(0);
    });

    it('should throw NotFoundError for non-existent character', async () => {
      (prisma.character.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(updateGold('non-existent', 10)).rejects.toThrow('not found');
    });
  });

  // ========== Level Up ==========

  describe('levelUp', () => {
    it('should increment level by 1', async () => {
      resetCharacter({ level: 1, maxHealth: 50, health: 30 });

      const result = await levelUp('char-001');

      expect(result.level).toBe(2);
    });

    it('should increase maxHealth by 5', async () => {
      resetCharacter({ level: 1, maxHealth: 50, health: 30 });

      const result = await levelUp('char-001');

      expect(result.maxHealth).toBe(55);
    });

    it('should restore health to new maxHealth', async () => {
      resetCharacter({ level: 1, maxHealth: 50, health: 10 });

      const result = await levelUp('char-001');

      expect(result.health).toBe(55); // new maxHealth
      expect(result.health).toBe(result.maxHealth);
    });

    it('should throw NotFoundError for non-existent character', async () => {
      (prisma.character.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(levelUp('non-existent')).rejects.toThrow('not found');
    });
  });

  // ========== Get Character ==========

  describe('getCharacter', () => {
    it('should return full character data', async () => {
      const result = await getCharacter('char-001');

      expect(result).toEqual({
        id: 'char-001',
        userId: 'user-001',
        name: 'Thorin',
        class: 'warrior',
        level: 1,
        health: 50,
        maxHealth: 50,
        inventory: ['sword', 'shield'],
        gold: 10,
        abilities: ['power_strike', 'defensive_stance'],
      });
    });

    it('should throw NotFoundError for non-existent character', async () => {
      (prisma.character.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(getCharacter('non-existent')).rejects.toThrow('not found');
    });
  });
});
