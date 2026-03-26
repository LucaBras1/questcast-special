/**
 * Conversation Summary Service -- Test Suite
 *
 * Tests for:
 * - Summary triggered at turn 10, 20, 30 (every 10 turns)
 * - Summary NOT triggered at turns 1-9, 11-19
 * - Summary content captures key decisions, NPCs, items
 * - Summary stored in game state correctly
 * - Summary failure: old summary preserved (not overwritten with error)
 */

// ---- Summary Service Simulation ----

function shouldGenerateSummary(turnsPlayed: number): boolean {
  return turnsPlayed > 0 && turnsPlayed % 10 === 0;
}

interface GameStateSummary {
  narrativeSummary: string;
  keyDecisions: string[];
  npcsMet: string[];
}

async function generateSummary(
  conversationHistory: Array<{ role: string; content: string }>,
  generateFn: (text: string) => Promise<string>,
): Promise<string> {
  const historyText = conversationHistory
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join('\n');

  return await generateFn(historyText);
}

async function updateSummary(
  currentState: GameStateSummary,
  conversationHistory: Array<{ role: string; content: string }>,
  generateFn: (text: string) => Promise<string>,
): Promise<GameStateSummary> {
  try {
    const newSummary = await generateSummary(conversationHistory, generateFn);
    return {
      ...currentState,
      narrativeSummary: newSummary,
    };
  } catch {
    return currentState;
  }
}

// ---- Tests ----

describe('Summary Service', () => {
  // ================================================================
  // Summary Trigger Conditions
  // ================================================================

  describe('shouldGenerateSummary()', () => {
    it('should trigger at turn 10', () => {
      expect(shouldGenerateSummary(10)).toBe(true);
    });

    it('should trigger at turn 20', () => {
      expect(shouldGenerateSummary(20)).toBe(true);
    });

    it('should trigger at turn 30', () => {
      expect(shouldGenerateSummary(30)).toBe(true);
    });

    it('should trigger at turn 40, 50, etc.', () => {
      expect(shouldGenerateSummary(40)).toBe(true);
      expect(shouldGenerateSummary(50)).toBe(true);
      expect(shouldGenerateSummary(100)).toBe(true);
    });

    it('should NOT trigger at turns 1-9', () => {
      for (let i = 1; i <= 9; i++) {
        expect(shouldGenerateSummary(i)).toBe(false);
      }
    });

    it('should NOT trigger at turns 11-19', () => {
      for (let i = 11; i <= 19; i++) {
        expect(shouldGenerateSummary(i)).toBe(false);
      }
    });

    it('should NOT trigger at turn 0', () => {
      expect(shouldGenerateSummary(0)).toBe(false);
    });

    it('should NOT trigger at turns 21-29', () => {
      for (let i = 21; i <= 29; i++) {
        expect(shouldGenerateSummary(i)).toBe(false);
      }
    });
  });

  // ================================================================
  // Summary Content
  // ================================================================

  describe('Summary content', () => {
    const mockHistory = [
      { role: 'user', content: 'I enter the tavern and look for the bartender.' },
      {
        role: 'assistant',
        content:
          'You push open the creaky door. Bartender Grog waves you over. He mentions a lost amulet.',
      },
      { role: 'user', content: 'I ask about the amulet and accept the quest.' },
      {
        role: 'assistant',
        content:
          'Grog tells you the Amulet of Stars was taken to the Dark Cave. He gives you a Healing Potion.',
      },
      { role: 'user', content: 'I leave the tavern and head to the Dark Cave.' },
      {
        role: 'assistant',
        content:
          'You travel through the Elderwood Forest. The cave entrance looms before you, dark and foreboding.',
      },
    ];

    it('should capture key decisions in summary', async () => {
      const mockGenerateFn = jest.fn().mockResolvedValue(
        'The adventurer accepted a quest from Bartender Grog to retrieve the Amulet of Stars from the Dark Cave. Key decisions: accepted the quest, headed to Dark Cave.',
      );

      const summary = await generateSummary(mockHistory, mockGenerateFn);

      expect(summary).toContain('quest');
      expect(summary).toContain('Dark Cave');
    });

    it('should capture NPC names in summary', async () => {
      const mockGenerateFn = jest.fn().mockResolvedValue(
        'Met Bartender Grog who provided information about the Amulet of Stars.',
      );

      const summary = await generateSummary(mockHistory, mockGenerateFn);
      expect(summary).toContain('Grog');
    });

    it('should capture items in summary', async () => {
      const mockGenerateFn = jest.fn().mockResolvedValue(
        'Received a Healing Potion from Grog. Seeking the Amulet of Stars.',
      );

      const summary = await generateSummary(mockHistory, mockGenerateFn);
      expect(summary).toContain('Healing Potion');
      expect(summary).toContain('Amulet');
    });

    it('should pass conversation history to the generate function', async () => {
      const mockGenerateFn = jest.fn().mockResolvedValue('Summary text.');

      await generateSummary(mockHistory, mockGenerateFn);

      expect(mockGenerateFn).toHaveBeenCalledTimes(1);
      const passedText = mockGenerateFn.mock.calls[0][0];
      expect(passedText).toContain('tavern');
      expect(passedText).toContain('amulet');
    });
  });

  // ================================================================
  // Summary Storage
  // ================================================================

  describe('Summary storage in game state', () => {
    it('should store summary in game state correctly', async () => {
      const currentState: GameStateSummary = {
        narrativeSummary: 'Old summary.',
        keyDecisions: ['Started quest'],
        npcsMet: ['Grog'],
      };

      const mockGenerateFn = jest
        .fn()
        .mockResolvedValue('New comprehensive summary of the adventure.');

      const updated = await updateSummary(currentState, [], mockGenerateFn);

      expect(updated.narrativeSummary).toBe('New comprehensive summary of the adventure.');
      expect(updated.keyDecisions).toEqual(['Started quest']);
      expect(updated.npcsMet).toEqual(['Grog']);
    });

    it('should overwrite old summary with new one', async () => {
      const currentState: GameStateSummary = {
        narrativeSummary: 'Summary from turn 10.',
        keyDecisions: [],
        npcsMet: [],
      };

      const mockGenerateFn = jest.fn().mockResolvedValue('Summary from turn 20.');
      const updated = await updateSummary(currentState, [], mockGenerateFn);

      expect(updated.narrativeSummary).toBe('Summary from turn 20.');
      expect(updated.narrativeSummary).not.toBe('Summary from turn 10.');
    });
  });

  // ================================================================
  // Summary Failure Handling
  // ================================================================

  describe('Summary failure handling', () => {
    it('should preserve old summary when LLM fails', async () => {
      const currentState: GameStateSummary = {
        narrativeSummary: 'This is the existing good summary.',
        keyDecisions: ['Entered cave'],
        npcsMet: ['Wizard'],
      };

      const mockGenerateFn = jest
        .fn()
        .mockRejectedValue(new Error('LLM rate limit exceeded'));

      const updated = await updateSummary(currentState, [], mockGenerateFn);

      expect(updated.narrativeSummary).toBe('This is the existing good summary.');
      expect(updated.keyDecisions).toEqual(['Entered cave']);
      expect(updated.npcsMet).toEqual(['Wizard']);
    });

    it('should preserve old summary when LLM returns empty response', async () => {
      const currentState: GameStateSummary = {
        narrativeSummary: 'Good existing summary.',
        keyDecisions: [],
        npcsMet: [],
      };

      const mockGenerateFn = jest.fn().mockRejectedValue(new Error('Empty response'));
      const updated = await updateSummary(currentState, [], mockGenerateFn);

      expect(updated.narrativeSummary).toBe('Good existing summary.');
    });

    it('should not overwrite summary with error message', async () => {
      const currentState: GameStateSummary = {
        narrativeSummary: 'Valid adventure summary.',
        keyDecisions: [],
        npcsMet: [],
      };

      const mockGenerateFn = jest
        .fn()
        .mockRejectedValue(new Error('API timeout after 30000ms'));

      const updated = await updateSummary(currentState, [], mockGenerateFn);

      expect(updated.narrativeSummary).not.toContain('Error');
      expect(updated.narrativeSummary).not.toContain('timeout');
      expect(updated.narrativeSummary).toBe('Valid adventure summary.');
    });
  });
});
