import {
  createSessionSchema,
  sessionIdParamSchema,
  turnRequestSchema,
  updateSessionStatusSchema,
  llmNarrationResponseSchema,
  llmDiceInterpretationSchema,
  llmSummarySchema,
} from '../src/models/schemas';

describe('Game Schemas', () => {
  describe('createSessionSchema', () => {
    it('should validate correct session creation input', () => {
      const input = {
        characterName: 'Thorin',
        characterClass: 'warrior',
        language: 'cs',
      };
      const result = createSessionSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should default language to en', () => {
      const input = {
        characterName: 'Gandalf',
        characterClass: 'mage',
      };
      const result = createSessionSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe('en');
      }
    });

    it('should reject invalid character class', () => {
      const input = {
        characterName: 'Bob',
        characterClass: 'paladin',
      };
      const result = createSessionSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should accept all valid character classes', () => {
      for (const cls of ['warrior', 'mage', 'rogue', 'ranger']) {
        const result = createSessionSchema.safeParse({
          characterName: 'Test',
          characterClass: cls,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('sessionIdParamSchema', () => {
    it('should accept valid UUID', () => {
      const result = sessionIdParamSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject non-UUID string', () => {
      const result = sessionIdParamSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });
});

describe('Turn Request Schema', () => {
  describe('turnRequestSchema', () => {
    it('should accept text input', () => {
      const result = turnRequestSchema.safeParse({ textInput: 'I attack the goblin' });
      expect(result.success).toBe(true);
    });

    it('should accept audio input', () => {
      const result = turnRequestSchema.safeParse({ audioBase64: 'SGVsbG8gV29ybGQ=' });
      expect(result.success).toBe(true);
    });

    it('should accept both audio and text', () => {
      const result = turnRequestSchema.safeParse({
        audioBase64: 'SGVsbG8=',
        textInput: 'fallback text',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty input (no audio or text)', () => {
      const result = turnRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject text input exceeding 1000 chars', () => {
      const result = turnRequestSchema.safeParse({ textInput: 'A'.repeat(1001) });
      expect(result.success).toBe(false);
    });
  });
});

describe('Session Status Schema', () => {
  describe('updateSessionStatusSchema', () => {
    it('should accept valid statuses', () => {
      for (const status of ['active', 'paused', 'completed']) {
        const result = updateSessionStatusSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = updateSessionStatusSchema.safeParse({ status: 'deleted' });
      expect(result.success).toBe(false);
    });
  });
});

describe('LLM Response Schemas', () => {
  describe('llmNarrationResponseSchema', () => {
    it('should validate a full narration response', () => {
      const response = {
        narration: 'You enter the dark cave. Water drips from stalactites above.',
        stateUpdates: {
          locationChange: 'Dark Cave',
          threatLevel: 'moderate',
          timeOfDay: 'night',
        },
        suggestedActions: ['Light a torch', 'Listen carefully', 'Draw your weapon'],
        requiresDiceRoll: false,
      };
      const result = llmNarrationResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate minimal narration response', () => {
      const response = {
        narration: 'The tavern is warm and inviting.',
      };
      const result = llmNarrationResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject empty narration', () => {
      const response = {
        narration: '',
      };
      const result = llmNarrationResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should validate with inventory changes', () => {
      const response = {
        narration: 'You find a rusty sword on the ground and pick it up.',
        stateUpdates: {
          inventoryAdd: ['Rusty Sword'],
          goldChange: 5,
        },
      };
      const result = llmNarrationResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should enforce max 3 suggested actions', () => {
      const response = {
        narration: 'You stand at a crossroads.',
        suggestedActions: ['Go north', 'Go south', 'Go east', 'Go west'],
      };
      const result = llmNarrationResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });

  describe('llmDiceInterpretationSchema', () => {
    it('should validate a dice interpretation', () => {
      const response = {
        narration: 'Your sword strikes true, cleaving through the goblin!',
        outcome: 'critical_success',
        stateUpdates: {
          healthChange: 0,
          goldChange: 10,
          inventoryAdd: ['Goblin Ear'],
        },
      };
      const result = llmDiceInterpretationSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should accept all valid outcomes', () => {
      for (const outcome of [
        'critical_success',
        'success',
        'partial',
        'failure',
        'critical_failure',
      ]) {
        const result = llmDiceInterpretationSchema.safeParse({
          narration: 'Something happens.',
          outcome,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('llmSummarySchema', () => {
    it('should validate a summary', () => {
      const response = {
        summary:
          'The adventurer entered the Dark Cave, defeated two goblins, and found a mysterious key.',
      };
      const result = llmSummarySchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should reject summary exceeding 500 chars', () => {
      const response = {
        summary: 'A'.repeat(501),
      };
      const result = llmSummarySchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });
});
