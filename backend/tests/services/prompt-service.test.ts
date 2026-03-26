/**
 * Prompt Service -- Test Suite
 *
 * Tests for:
 * - Prompt assembly with variable substitution
 * - Template file loading
 * - Token budget constraints
 * - Language selection (Czech/English)
 * - Safety rules injection
 * - Narrative summary injection
 */

import { createMockGameState } from '../setup';

// ---- Mock fs ----

const mockTemplates: Record<string, string> = {
  'system_prompt_base_en.txt':
    'You are a {narrator_style} Dungeon Master.\nDifficulty: {difficulty_level}\nRating: {content_rating}\n\n{content_safety_rules}\n\nGame State:\n{game_state_json}\n\nPrevious Summary:\n{narrative_summary}\n\n{conversation_history}',
  'system_prompt_base_cs.txt':
    'Jsi {narrator_style} Dungeon Master.\nObtiznost: {difficulty_level}\nHodnoceni: {content_rating}\n\n{content_safety_rules}\n\nStav hry:\n{game_state_json}\n\nPredchozi shruti:\n{narrative_summary}\n\n{conversation_history}',
  'content_safety_rules.txt':
    'SAFETY: No explicit violence against real people. No sexual content involving minors. No real-world weapon instructions.',
  'scene_description.txt':
    'Describe the scene at {location} during {time_of_day}. Weather: {weather}. Threat: {threat_level}.',
  'combat.txt':
    'Combat with {enemy_type}. Stats: {enemy_stats}. Difficulty: {difficulty_level}. Player: {player_stats}.',
  'dice_interpretation.txt':
    'Roll: {roll_value} on {dice_type}. Action: {action_type}. DC: {difficulty_class}. Modifiers: {modifiers}. Result: {final_result}.',
  'conversation_summary.txt': 'Summarize the following turns:\n{recent_turns}',
  'cliffhanger.txt': 'Create a dramatic cliffhanger.',
  'recap.txt': 'Provide a recap of the adventure so far.',
  'tutorial.txt': 'Guide the new player through their first steps.',
};

jest.mock('fs', () => ({
  readFileSync: jest.fn((filepath: string) => {
    // Handle both forward and back slashes (Windows/Linux)
    const filename = filepath.replace(/\\/g, '/').split('/').pop() || '';
    if (mockTemplates[filename]) {
      return mockTemplates[filename];
    }
    throw new Error(`ENOENT: no such file or directory, open '${filepath}'`);
  }),
}));

// Mock logger to suppress output
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock config
jest.mock('../../src/utils/config', () => ({
  config: {},
}));

// Import after mocks
import {
  loadPromptTemplates,
  assembleSystemPrompt,
  assembleTurnPrompt,
  formatConversationHistory,
  assembleScenePrompt,
  assembleCombatPrompt,
  assembleDicePrompt,
  assembleSummaryPrompt,
} from '../../src/services/prompt-service';

import type { ConversationEntry } from '../../src/services/redis';

// ---- Tests ----

describe('Prompt Service', () => {
  beforeAll(() => {
    loadPromptTemplates();
  });

  // ================================================================
  // Prompt Assembly
  // ================================================================

  describe('assembleSystemPrompt()', () => {
    it('should correctly substitute all variables', () => {
      const gameState = createMockGameState();
      const prompt = assembleSystemPrompt('en', 'teen', gameState as any, 'The hero entered the cave.');

      expect(prompt).toContain('epic'); // narrator_style
      expect(prompt).toContain('standard'); // difficulty_level
      expect(prompt).toContain('teen'); // content_rating
      expect(prompt).toContain('SAFETY:'); // content_safety_rules
      expect(prompt).toContain('The hero entered the cave.'); // narrative_summary
    });

    it('should include game state JSON in the prompt', () => {
      const gameState = createMockGameState({
        character: {
          id: 'c1',
          name: 'Thorin',
          class: 'warrior',
          level: 5,
          health: 80,
          maxHealth: 100,
          inventory: ['Rusty Sword'],
          gold: 50,
          abilities: ['Sword Strike'],
        },
      });

      const prompt = assembleSystemPrompt('en', 'teen', gameState as any, '');

      // Should contain character data
      expect(prompt).toContain('Thorin');
      expect(prompt).toContain('warrior');
    });

    it('should inject content safety rules into the prompt', () => {
      const gameState = createMockGameState();
      const prompt = assembleSystemPrompt('en', 'teen', gameState as any, '');

      expect(prompt).toContain('No explicit violence against real people');
      expect(prompt).toContain('No sexual content involving minors');
      expect(prompt).toContain('No real-world weapon instructions');
    });

    it('should inject narrative summary into prompt context', () => {
      const gameState = createMockGameState();
      const summary =
        'The adventurer met a mysterious wizard who gave them a quest to find the lost amulet.';
      const prompt = assembleSystemPrompt('en', 'teen', gameState as any, summary);

      expect(prompt).toContain(summary);
    });

    it('should use default summary text when no summary provided', () => {
      const gameState = createMockGameState();
      const prompt = assembleSystemPrompt('en', 'teen', gameState as any, '');

      expect(prompt).toContain('No previous summary');
    });
  });

  // ================================================================
  // Language Selection
  // ================================================================

  describe('Language selection', () => {
    it('should load English prompt for "en" language', () => {
      const gameState = createMockGameState();
      const prompt = assembleSystemPrompt('en', 'teen', gameState as any, '');

      expect(prompt).toContain('You are a');
      expect(prompt).not.toContain('Jsi');
    });

    it('should load Czech prompt for "cs" language', () => {
      const gameState = createMockGameState();
      const prompt = assembleSystemPrompt('cs', 'teen', gameState as any, '');

      expect(prompt).toContain('Jsi');
      expect(prompt).not.toContain('You are a');
    });
  });

  // ================================================================
  // Template Loading
  // ================================================================

  describe('Template loading', () => {
    it('should load all required template files', () => {
      const fs = require('fs');
      const readFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;

      // Reset call count
      readFileSync.mockClear();
      loadPromptTemplates();

      // Should have loaded all template files
      const calledFilenames = readFileSync.mock.calls.map((call: any[]) => {
        const path = call[0] as string;
        return path.replace(/\\/g, '/').split('/').pop();
      });

      expect(calledFilenames).toContain('system_prompt_base_en.txt');
      expect(calledFilenames).toContain('system_prompt_base_cs.txt');
      expect(calledFilenames).toContain('content_safety_rules.txt');
      expect(calledFilenames).toContain('scene_description.txt');
      expect(calledFilenames).toContain('combat.txt');
      expect(calledFilenames).toContain('dice_interpretation.txt');
      expect(calledFilenames).toContain('conversation_summary.txt');
      expect(calledFilenames).toContain('cliffhanger.txt');
      expect(calledFilenames).toContain('recap.txt');
      expect(calledFilenames).toContain('tutorial.txt');
    });

    it('should handle missing template file gracefully', () => {
      const fs = require('fs');
      const original = fs.readFileSync;

      // Temporarily make one file "missing"
      fs.readFileSync = jest.fn((filepath: string, _encoding: string) => {
        const filename = filepath.replace(/\\/g, '/').split('/').pop() || '';
        if (filename === 'cliffhanger.txt') {
          throw new Error(`ENOENT: no such file or directory`);
        }
        return mockTemplates[filename] || '';
      });

      // Should not throw
      expect(() => loadPromptTemplates()).not.toThrow();

      // Restore
      fs.readFileSync = original;
    });
  });

  // ================================================================
  // Token Budget
  // ================================================================

  describe('Token budget', () => {
    it('should produce a prompt within reasonable token limits', () => {
      const gameState = createMockGameState();
      const prompt = assembleSystemPrompt('en', 'teen', gameState as any, 'Short summary.');

      // Rough estimate: 1 token per ~4 characters
      const estimatedTokens = Math.ceil(prompt.length / 4);

      // System prompt + game state + summary should be well under 4000 tokens
      // (leaving room for conversation history and response)
      expect(estimatedTokens).toBeLessThan(4000);
    });

    it('should optimize game state to reduce token usage', () => {
      const minimalState = createMockGameState({
        character: {
          id: 'c1',
          name: 'Hero',
          class: 'warrior',
          level: 1,
          health: 100,
          maxHealth: 100,
          inventory: [], // empty -- should be omitted
          gold: 0, // zero -- should be omitted
          abilities: [], // empty -- should be omitted
        },
        story: {
          currentChapter: 1, // chapter 1 -- should be omitted
          currentLocation: 'Tavern',
          activeQuest: 'Start',
          questProgress: 0,
          npcsMet: [], // empty -- should be omitted
          keyDecisions: [], // empty -- should be omitted
          narrativeSummary: '',
        },
      });

      const prompt = assembleSystemPrompt('en', 'teen', minimalState as any, '');

      // Verify optimized state does not include empty arrays or zero values
      // (The prompt service's optimizeGameState should handle this)
      const stateMatch = prompt.match(/\{[\s\S]*"session_id"[\s\S]*\}/);
      if (stateMatch) {
        const stateJson = stateMatch[0];
        expect(stateJson).not.toContain('"inventory": []');
        expect(stateJson).not.toContain('"gold": 0');
      }
    });
  });

  // ================================================================
  // Conversation History Formatting
  // ================================================================

  describe('formatConversationHistory()', () => {
    it('should format conversation entries as chat messages', () => {
      const history: ConversationEntry[] = [
        { role: 'user', content: 'I open the door.', turnNumber: 1, timestamp: '2026-01-01T00:00:00Z' },
        { role: 'assistant', content: 'The door creaks open.', turnNumber: 1, timestamp: '2026-01-01T00:00:01Z' },
      ];

      const formatted = formatConversationHistory(history);

      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toEqual({ role: 'user', content: 'I open the door.' });
      expect(formatted[1]).toEqual({ role: 'assistant', content: 'The door creaks open.' });
    });

    it('should handle empty history', () => {
      const formatted = formatConversationHistory([]);
      expect(formatted).toEqual([]);
    });
  });

  // ================================================================
  // Specialized Prompts
  // ================================================================

  describe('Specialized prompt assembly', () => {
    it('should assemble scene description prompt with all variables', () => {
      const prompt = assembleScenePrompt('Dark Cave', 'night', 'stormy', 'high');

      expect(prompt).toContain('Dark Cave');
      expect(prompt).toContain('night');
      expect(prompt).toContain('stormy');
      expect(prompt).toContain('high');
    });

    it('should assemble combat prompt with all variables', () => {
      const prompt = assembleCombatPrompt(
        'Goblin Warrior',
        'HP: 30, AC: 12',
        'standard',
        'HP: 100, AC: 15',
      );

      expect(prompt).toContain('Goblin Warrior');
      expect(prompt).toContain('HP: 30, AC: 12');
      expect(prompt).toContain('standard');
      expect(prompt).toContain('HP: 100, AC: 15');
    });

    it('should assemble dice prompt with all variables', () => {
      const prompt = assembleDicePrompt(17, 'd20', 'lockpicking', 15, 2, 'success');

      expect(prompt).toContain('17');
      expect(prompt).toContain('d20');
      expect(prompt).toContain('lockpicking');
      expect(prompt).toContain('15');
      expect(prompt).toContain('2');
      expect(prompt).toContain('success');
    });

    it('should assemble summary prompt with recent turns', () => {
      const recentTurns = 'Turn 1: Player opened door. AI described corridor.\nTurn 2: Player attacked goblin.';
      const prompt = assembleSummaryPrompt(recentTurns);

      expect(prompt).toContain(recentTurns);
    });
  });

  // ================================================================
  // Turn Prompt
  // ================================================================

  describe('assembleTurnPrompt()', () => {
    it('should return the player input', () => {
      const result = assembleTurnPrompt('I open the door.', []);
      expect(result).toBe('I open the door.');
    });

    it('should handle empty input', () => {
      const result = assembleTurnPrompt('', []);
      expect(result).toBe('');
    });
  });
});
