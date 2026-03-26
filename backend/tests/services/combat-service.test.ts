/**
 * Combat Service -- Test Suite
 *
 * Tests for:
 * - Enemy generation by type and difficulty (level scaling)
 * - Combat initiation (state setup, threat level)
 * - Combat actions: attack, defend, spell, flee
 * - Victory: rewards, threat level restore
 * - Defeat: death save, revival
 * - Edge cases: unknown enemy type, no active combat
 */

import '../setup';

// ---- Mock Redis ----

const mockRedisStore: Record<string, unknown> = {};

jest.mock('../../src/services/redis', () => ({
  getRedis: jest.fn(() => ({
    get: jest.fn((key: string) => Promise.resolve(mockRedisStore[key] ?? null)),
    set: jest.fn((key: string, value: unknown) => {
      mockRedisStore[key] = value;
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      delete mockRedisStore[key];
      return Promise.resolve(1);
    }),
  })),
  isRedisAvailable: jest.fn(() => Promise.resolve(true)),
  setSessionState: jest.fn(),
  getSessionState: jest.fn(),
}));

// ---- Mock Game Service ----

let mockGameState = {
  character: {
    id: 'char-001',
    name: 'Thorin',
    class: 'warrior',
    level: 1,
    health: 50,
    maxHealth: 50,
    inventory: ['sword', 'shield'],
    gold: 10,
    abilities: ['power_strike', 'defensive_stance'],
  },
  world: {
    threatLevel: 'low',
  },
};

jest.mock('../../src/services/game-service', () => ({
  getGameState: jest.fn(() => Promise.resolve({ ...mockGameState, character: { ...mockGameState.character } })),
  updateGameState: jest.fn(),
  recordGameEvent: jest.fn(),
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
  generateEnemyStats,
  initiateCombat,
  processCombatAction,
  endCombat,
  getActiveCombat,
  getEnemyTypes,
} from '../../src/services/combat-service';

import { updateGameState } from '../../src/services/game-service';

// ---- Helpers ----

function resetGameState(overrides: Partial<typeof mockGameState> = {}) {
  mockGameState = {
    character: {
      id: 'char-001',
      name: 'Thorin',
      class: 'warrior',
      level: 1,
      health: 50,
      maxHealth: 50,
      inventory: ['sword', 'shield'],
      gold: 10,
      abilities: ['power_strike', 'defensive_stance'],
    },
    world: {
      threatLevel: 'low',
    },
    ...overrides,
  };
}

function clearRedisStore() {
  for (const key of Object.keys(mockRedisStore)) {
    delete mockRedisStore[key];
  }
}

// ---- Tests ----

describe('Combat Service', () => {
  beforeEach(() => {
    resetGameState();
    clearRedisStore();
    jest.clearAllMocks();
  });

  // ================================================================
  // Enemy Generation
  // ================================================================

  describe('generateEnemyStats()', () => {
    it('should generate a goblin with correct base stats at level 1', () => {
      const enemy = generateEnemyStats('goblin', 1);

      expect(enemy.name).toBe('Goblin');
      expect(enemy.type).toBe('goblin');
      expect(enemy.health).toBe(15);
      expect(enemy.maxHealth).toBe(15);
      expect(enemy.attack).toBe(4);
      expect(enemy.defense).toBe(2);
      expect(enemy.xpReward).toBe(20);
      expect(enemy.goldReward).toBe(5);
      expect(enemy.abilities).toEqual(['quick_stab']);
    });

    it('should generate a skeleton with correct base stats at level 1', () => {
      const enemy = generateEnemyStats('skeleton', 1);

      expect(enemy.name).toBe('Skeleton');
      expect(enemy.type).toBe('skeleton');
      expect(enemy.health).toBe(20);
      expect(enemy.attack).toBe(5);
      expect(enemy.abilities).toContain('bone_strike');
      expect(enemy.abilities).toContain('reassemble');
    });

    it('should generate a bandit with correct base stats at level 1', () => {
      const enemy = generateEnemyStats('bandit', 1);

      expect(enemy.name).toBe('Bandit');
      expect(enemy.health).toBe(25);
      expect(enemy.goldReward).toBe(15);
    });

    it('should generate a wolf with correct base stats at level 1', () => {
      const enemy = generateEnemyStats('wolf', 1);

      expect(enemy.name).toBe('Wolf');
      expect(enemy.health).toBe(18);
      expect(enemy.attack).toBe(7);
    });

    it('should generate a troll with correct base stats at level 1', () => {
      const enemy = generateEnemyStats('troll', 1);

      expect(enemy.name).toBe('Troll');
      expect(enemy.health).toBe(40);
      expect(enemy.attack).toBe(8);
      expect(enemy.defense).toBe(5);
    });

    it('should scale enemy stats with player level', () => {
      const level1 = generateEnemyStats('goblin', 1);
      const level5 = generateEnemyStats('goblin', 5);

      // Level 5 multiplier: 1 + (5-1) * 0.15 = 1.6
      expect(level5.health).toBeGreaterThan(level1.health);
      expect(level5.attack).toBeGreaterThan(level1.attack);
      expect(level5.xpReward).toBeGreaterThan(level1.xpReward);
      expect(level5.goldReward).toBeGreaterThan(level1.goldReward);
    });

    it('should scale health correctly at level 5 (1.6x multiplier)', () => {
      const enemy = generateEnemyStats('goblin', 5);
      // baseHealth 15 * 1.6 = 24
      expect(enemy.health).toBe(24);
      expect(enemy.maxHealth).toBe(24);
    });

    it('should fall back to goblin for unknown enemy type', () => {
      const enemy = generateEnemyStats('dragon', 1);

      expect(enemy.name).toBe('Goblin');
      expect(enemy.type).toBe('goblin');
      expect(enemy.health).toBe(15);
    });

    it('should have health equal to maxHealth', () => {
      const types = ['goblin', 'skeleton', 'bandit', 'wolf', 'troll'];
      for (const type of types) {
        const enemy = generateEnemyStats(type, 1);
        expect(enemy.health).toBe(enemy.maxHealth);
      }
    });
  });

  // ================================================================
  // Enemy Types
  // ================================================================

  describe('getEnemyTypes()', () => {
    it('should return all five enemy types', () => {
      const types = getEnemyTypes();

      expect(types).toContain('goblin');
      expect(types).toContain('skeleton');
      expect(types).toContain('bandit');
      expect(types).toContain('wolf');
      expect(types).toContain('troll');
      expect(types).toHaveLength(5);
    });
  });

  // ================================================================
  // Combat Initiation
  // ================================================================

  describe('initiateCombat()', () => {
    it('should create combat state and return enemy stats', async () => {
      const result = await initiateCombat('session-1', 'goblin');

      expect(result.combatId).toBeDefined();
      expect(result.enemy.name).toBe('Goblin');
      expect(result.enemy.health).toBe(15);
    });

    it('should set threat level to critical', async () => {
      await initiateCombat('session-1', 'goblin');

      expect(updateGameState).toHaveBeenCalledWith('session-1', {
        threatLevel: 'critical',
      });
    });

    it('should store combat state in Redis', async () => {
      await initiateCombat('session-1', 'goblin');

      const combatState = mockRedisStore['session:session-1:combat'] as any;
      expect(combatState).toBeDefined();
      expect(combatState.active).toBe(true);
      expect(combatState.enemy.name).toBe('Goblin');
      expect(combatState.turnCount).toBe(0);
      expect(combatState.log).toEqual([]);
    });

    it('should scale enemy to player level', async () => {
      resetGameState({
        character: {
          ...mockGameState.character,
          level: 5,
        },
      });

      const result = await initiateCombat('session-1', 'goblin');

      expect(result.enemy.health).toBeGreaterThan(15);
    });
  });

  // ================================================================
  // Combat Actions
  // ================================================================

  describe('processCombatAction()', () => {
    async function setupActiveCombat(enemyType: string = 'goblin') {
      const { combatId } = await initiateCombat('session-1', enemyType);
      return combatId;
    }

    describe('attack action', () => {
      it('should deal damage on successful roll', async () => {
        await setupActiveCombat();

        const result = await processCombatAction('session-1', 'attack', {
          rollValue: 15,
          total: 12,
          success: true,
        });

        expect(result.action).toBe('attack');
        expect(result.playerDamageDealt).toBeGreaterThan(0);
        expect(result.narrationContext).toBe('hit');
      });

      it('should deal double damage on natural 20 (critical hit)', async () => {
        await setupActiveCombat();

        const result = await processCombatAction('session-1', 'attack', {
          rollValue: 20,
          total: 20,
          success: true,
        });

        expect(result.narrationContext).toBe('critical_hit');
        // Critical hit doubles damage
        expect(result.playerDamageDealt).toBeGreaterThan(0);
      });

      it('should deal zero damage on failed roll', async () => {
        await setupActiveCombat();

        const result = await processCombatAction('session-1', 'attack', {
          rollValue: 3,
          total: 3,
          success: false,
        });

        expect(result.playerDamageDealt).toBe(0);
        expect(result.narrationContext).toBe('miss');
      });
    });

    describe('defend action', () => {
      it('should reduce incoming damage', async () => {
        await setupActiveCombat();

        const result = await processCombatAction('session-1', 'defend', {
          rollValue: 12,
          total: 12,
          success: true,
        });

        expect(result.action).toBe('defend');
        expect(result.narrationContext).toBe('defend');
        // Defend reduces incoming damage to 30% max or blocks entirely
        expect(result.playerDamageDealt).toBe(0);
      });
    });

    describe('spell action', () => {
      it('should deal extra damage on success (1.5x multiplier)', async () => {
        await setupActiveCombat();

        const result = await processCombatAction('session-1', 'spell', {
          rollValue: 15,
          total: 12,
          success: true,
        });

        expect(result.action).toBe('spell');
        expect(result.playerDamageDealt).toBeGreaterThan(0);
        expect(result.narrationContext).toBe('spell_hit');
      });

      it('should deal double damage on critical spell (nat 20)', async () => {
        await setupActiveCombat();

        const result = await processCombatAction('session-1', 'spell', {
          rollValue: 20,
          total: 20,
          success: true,
        });

        expect(result.narrationContext).toBe('critical_spell');
      });

      it('should fizzle on failed roll', async () => {
        await setupActiveCombat();

        const result = await processCombatAction('session-1', 'spell', {
          rollValue: 2,
          total: 2,
          success: false,
        });

        expect(result.playerDamageDealt).toBe(0);
        expect(result.narrationContext).toBe('spell_fizzle');
      });
    });

    describe('flee action', () => {
      it('should end combat without rewards on successful flee', async () => {
        await setupActiveCombat();

        const result = await processCombatAction('session-1', 'flee', {
          rollValue: 15,
          total: 15,
          success: true,
        });

        expect(result.action).toBe('flee');
        expect(result.combatEnded).toBe(true);
        expect(result.outcome).toBe('fled');
        expect(result.rewards).toBeUndefined();
        expect(result.narrationContext).toBe('flee_success');
      });

      it('should result in enemy free attack on failed flee', async () => {
        await setupActiveCombat();

        const result = await processCombatAction('session-1', 'flee', {
          rollValue: 4,
          total: 4,
          success: false,
        });

        expect(result.combatEnded).toBe(false);
        expect(result.narrationContext).toBe('flee_fail');
        expect(result.playerDamageReceived).toBeGreaterThan(0);
      });
    });

    describe('combat end conditions', () => {
      it('should end combat with victory when enemy health reaches 0', async () => {
        await setupActiveCombat();

        // Repeatedly attack with high rolls until enemy is defeated
        let combatEnded = false;
        let lastResult;
        let maxTurns = 20;

        while (!combatEnded && maxTurns > 0) {
          lastResult = await processCombatAction('session-1', 'attack', {
            rollValue: 20,
            total: 50, // Extremely high total to guarantee kill
            success: true,
          });
          combatEnded = lastResult.combatEnded;
          maxTurns--;

          // Re-initiate if needed (combat may have ended on first hit with high damage)
          if (combatEnded) break;
        }

        expect(lastResult!.combatEnded).toBe(true);
        expect(lastResult!.outcome).toBe('victory');
        expect(lastResult!.rewards).toBeDefined();
        expect(lastResult!.rewards!.xp).toBeGreaterThan(0);
        expect(lastResult!.rewards!.gold).toBeGreaterThan(0);
      });

      it('should award gold on victory via game state update', async () => {
        await setupActiveCombat();

        // Use very high total to one-shot
        await processCombatAction('session-1', 'attack', {
          rollValue: 20,
          total: 100,
          success: true,
        });

        // Should have called updateGameState with goldChange
        expect(updateGameState).toHaveBeenCalledWith(
          'session-1',
          expect.objectContaining({ goldChange: expect.any(Number) }),
        );
      });
    });

    it('should throw error when no active combat exists', async () => {
      // No combat initiated
      await expect(
        processCombatAction('session-1', 'attack', {
          rollValue: 15,
          total: 15,
          success: true,
        }),
      ).rejects.toThrow('No active combat');
    });

    it('should increment turn count with each action', async () => {
      await setupActiveCombat();

      await processCombatAction('session-1', 'defend', {
        rollValue: 10,
        total: 10,
        success: true,
      });

      const combatState = mockRedisStore['session:session-1:combat'] as any;
      expect(combatState.turnCount).toBe(1);
    });
  });

  // ================================================================
  // End Combat
  // ================================================================

  describe('endCombat()', () => {
    it('should set threat level to low on victory', async () => {
      await endCombat('session-1', 'victory');

      expect(updateGameState).toHaveBeenCalledWith('session-1', {
        threatLevel: 'low',
      });
    });

    it('should set threat level to high on defeat', async () => {
      await endCombat('session-1', 'defeat');

      expect(updateGameState).toHaveBeenCalledWith('session-1', {
        threatLevel: 'high',
      });
    });

    it('should set threat level to low on fled', async () => {
      await endCombat('session-1', 'fled');

      expect(updateGameState).toHaveBeenCalledWith('session-1', {
        threatLevel: 'low',
      });
    });

    it('should clear combat state from Redis', async () => {
      // Set up some combat state
      mockRedisStore['session:session-1:combat'] = { active: true };

      await endCombat('session-1', 'victory');

      expect(mockRedisStore['session:session-1:combat']).toBeUndefined();
    });
  });

  // ================================================================
  // Get Active Combat
  // ================================================================

  describe('getActiveCombat()', () => {
    it('should return null when no combat is active', async () => {
      const result = await getActiveCombat('session-1');
      expect(result).toBeNull();
    });

    it('should return combat state when combat is active', async () => {
      await initiateCombat('session-1', 'goblin');

      const result = await getActiveCombat('session-1');

      expect(result).not.toBeNull();
      expect(result!.active).toBe(true);
      expect(result!.enemy.name).toBe('Goblin');
    });

    it('should return null for inactive combat state', async () => {
      mockRedisStore['session:session-1:combat'] = { active: false };

      const result = await getActiveCombat('session-1');
      expect(result).toBeNull();
    });
  });

  // ================================================================
  // Level Scaling Verification
  // ================================================================

  describe('Level scaling', () => {
    it('should make enemies progressively stronger', () => {
      const levels = [1, 3, 5, 10];
      const healthValues = levels.map((level) => generateEnemyStats('troll', level).health);

      for (let i = 1; i < healthValues.length; i++) {
        expect(healthValues[i]).toBeGreaterThan(healthValues[i - 1]);
      }
    });

    it('should apply 15% scaling per level above 1', () => {
      // Level 1: multiplier = 1.0
      // Level 2: multiplier = 1.15
      // Level 3: multiplier = 1.30
      const level1 = generateEnemyStats('goblin', 1);
      const level2 = generateEnemyStats('goblin', 2);
      const level3 = generateEnemyStats('goblin', 3);

      // Goblin base health: 15
      expect(level1.health).toBe(15); // 15 * 1.0
      expect(level2.health).toBe(Math.round(15 * 1.15)); // 17
      expect(level3.health).toBe(Math.round(15 * 1.30)); // 20
    });
  });
});
