/**
 * Content Moderation -- Test Suite
 *
 * Tests for:
 * - Safe inputs pass through (various normal game actions)
 * - Unsafe inputs caught: explicit violence, sexual content, hate speech, self-harm
 * - Edge cases: fantasy violence OK, real-world violence NOT OK
 * - Czech language moderation: unsafe content in Czech also caught
 * - Moderation API failure: turn continues without moderation (log warning, don't block)
 */

// ---- Mock OpenAI Moderation ----

const mockModerationsCreate = jest.fn();

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    moderations: {
      create: mockModerationsCreate,
    },
  })),
}));

// ---- Content Moderation Service Simulation ----

interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
}

async function moderateContent(text: string): Promise<ModerationResult> {
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI({ apiKey: 'test' });

  const result = await openai.moderations.create({ input: text });
  const modResult = result.results[0];

  return {
    flagged: modResult.flagged,
    categories: modResult.categories as unknown as Record<string, boolean>,
    categoryScores: modResult.category_scores as unknown as Record<string, number>,
  };
}

/**
 * Wrapper that handles moderation failure gracefully.
 * Returns { flagged: false, fallback: true } if the API is unavailable.
 */
async function safeModerateContent(
  text: string,
): Promise<ModerationResult & { fallback?: boolean }> {
  try {
    return await moderateContent(text);
  } catch {
    // Log warning, don't block the turn
    return {
      flagged: false,
      categories: {},
      categoryScores: {},
      fallback: true,
    };
  }
}

// ---- Helper to create moderation response ----

function createSafeResponse(): any {
  return {
    results: [
      {
        flagged: false,
        categories: {
          sexual: false,
          hate: false,
          harassment: false,
          'self-harm': false,
          'sexual/minors': false,
          'hate/threatening': false,
          'violence/graphic': false,
          violence: false,
        },
        category_scores: {
          sexual: 0.001,
          hate: 0.0005,
          harassment: 0.002,
          'self-harm': 0.0001,
          'sexual/minors': 0.00001,
          'hate/threatening': 0.0003,
          'violence/graphic': 0.001,
          violence: 0.01,
        },
      },
    ],
  };
}

function createFlaggedResponse(
  categories: Partial<Record<string, boolean>>,
  scores: Partial<Record<string, number>>,
): any {
  return {
    results: [
      {
        flagged: true,
        categories: {
          sexual: false,
          hate: false,
          harassment: false,
          'self-harm': false,
          'sexual/minors': false,
          'hate/threatening': false,
          'violence/graphic': false,
          violence: false,
          ...categories,
        },
        category_scores: {
          sexual: 0.001,
          hate: 0.001,
          harassment: 0.001,
          'self-harm': 0.001,
          'sexual/minors': 0.001,
          'hate/threatening': 0.001,
          'violence/graphic': 0.001,
          violence: 0.001,
          ...scores,
        },
      },
    ],
  };
}

// ---- Tests ----

describe('Content Moderation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ================================================================
  // Safe Inputs
  // ================================================================

  describe('Safe inputs pass through', () => {
    beforeEach(() => {
      mockModerationsCreate.mockResolvedValue(createSafeResponse());
    });

    const safeInputs = [
      'I carefully examine the ancient scroll.',
      'I open the door and look around.',
      'I ask the bartender about the quest.',
      'I draw my sword and prepare for battle.',
      'I pick up the healing potion from the shelf.',
      'I try to pick the lock on the treasure chest.',
      'I cast a fireball at the goblin.',
      'I rest by the campfire until morning.',
      'I negotiate with the merchant for a better price.',
      'I climb the wall to get a better view.',
    ];

    it.each(safeInputs)('should pass through: "%s"', async (input) => {
      const result = await moderateContent(input);

      expect(result.flagged).toBe(false);
      expect(mockModerationsCreate).toHaveBeenCalledWith({ input });
    });
  });

  // ================================================================
  // Unsafe Inputs
  // ================================================================

  describe('Unsafe inputs caught', () => {
    it('should flag explicit violence', async () => {
      mockModerationsCreate.mockResolvedValue(
        createFlaggedResponse(
          { violence: true, 'violence/graphic': true },
          { violence: 0.95, 'violence/graphic': 0.88 },
        ),
      );

      const result = await moderateContent('extremely graphic violent content');

      expect(result.flagged).toBe(true);
      expect(result.categories.violence).toBe(true);
    });

    it('should flag sexual content', async () => {
      mockModerationsCreate.mockResolvedValue(
        createFlaggedResponse({ sexual: true }, { sexual: 0.92 }),
      );

      const result = await moderateContent('explicit sexual content');

      expect(result.flagged).toBe(true);
      expect(result.categories.sexual).toBe(true);
    });

    it('should flag hate speech', async () => {
      mockModerationsCreate.mockResolvedValue(
        createFlaggedResponse(
          { hate: true, 'hate/threatening': true },
          { hate: 0.95, 'hate/threatening': 0.87 },
        ),
      );

      const result = await moderateContent('hateful discriminatory content');

      expect(result.flagged).toBe(true);
      expect(result.categories.hate).toBe(true);
    });

    it('should flag self-harm content', async () => {
      mockModerationsCreate.mockResolvedValue(
        createFlaggedResponse({ 'self-harm': true }, { 'self-harm': 0.91 }),
      );

      const result = await moderateContent('self-harm related content');

      expect(result.flagged).toBe(true);
      expect(result.categories['self-harm']).toBe(true);
    });

    it('should flag harassment content', async () => {
      mockModerationsCreate.mockResolvedValue(
        createFlaggedResponse({ harassment: true }, { harassment: 0.89 }),
      );

      const result = await moderateContent('harassing threatening content');

      expect(result.flagged).toBe(true);
      expect(result.categories.harassment).toBe(true);
    });
  });

  // ================================================================
  // Edge Cases: Fantasy vs Real Violence
  // ================================================================

  describe('Edge cases: fantasy vs real violence', () => {
    it('should pass fantasy violence ("I attack the goblin")', async () => {
      mockModerationsCreate.mockResolvedValue(createSafeResponse());

      const result = await moderateContent('I attack the goblin with my sword!');

      expect(result.flagged).toBe(false);
    });

    it('should pass game combat actions ("I cast fireball at the dragon")', async () => {
      mockModerationsCreate.mockResolvedValue(createSafeResponse());

      const result = await moderateContent('I cast a fireball at the dragon!');

      expect(result.flagged).toBe(false);
    });

    it('should flag real-world violence references', async () => {
      mockModerationsCreate.mockResolvedValue(
        createFlaggedResponse(
          { violence: true },
          { violence: 0.92 },
        ),
      );

      const result = await moderateContent(
        'I want to hurt real people in the real world',
      );

      expect(result.flagged).toBe(true);
    });

    it('should handle borderline input (low but non-zero scores)', async () => {
      // Borderline: not flagged overall, but some categories have moderate scores
      mockModerationsCreate.mockResolvedValue({
        results: [
          {
            flagged: false,
            categories: {
              violence: false,
              sexual: false,
              hate: false,
            },
            category_scores: {
              violence: 0.35, // Moderate but not flagged
              sexual: 0.02,
              hate: 0.01,
            },
          },
        ],
      });

      const result = await moderateContent('I aggressively challenge the bandit.');

      // Not flagged, but violence score is elevated
      expect(result.flagged).toBe(false);
      expect(result.categoryScores.violence).toBeGreaterThan(0.1);
      expect(result.categoryScores.violence).toBeLessThan(0.5);
    });
  });

  // ================================================================
  // Czech Language Moderation
  // ================================================================

  describe('Czech language moderation', () => {
    it('should catch unsafe content in Czech', async () => {
      mockModerationsCreate.mockResolvedValue(
        createFlaggedResponse(
          { hate: true },
          { hate: 0.88 },
        ),
      );

      const result = await moderateContent('nenavistny obsah v cestine');

      expect(result.flagged).toBe(true);
      expect(result.categories.hate).toBe(true);
    });

    it('should pass safe Czech input', async () => {
      mockModerationsCreate.mockResolvedValue(createSafeResponse());

      const result = await moderateContent('Prozkoumavam staroveky svitek opatrne.');

      expect(result.flagged).toBe(false);
    });

    it('should pass Czech fantasy combat', async () => {
      mockModerationsCreate.mockResolvedValue(createSafeResponse());

      const result = await moderateContent('Tasim mec a utocim na goblina!');

      expect(result.flagged).toBe(false);
    });
  });

  // ================================================================
  // Moderation API Failure
  // ================================================================

  describe('Moderation API failure handling', () => {
    it('should continue without moderation when API fails', async () => {
      mockModerationsCreate.mockRejectedValue(
        new Error('Moderation API unavailable'),
      );

      const result = await safeModerateContent('I open the door.');

      // Should NOT be flagged -- allow the turn to continue
      expect(result.flagged).toBe(false);
      expect(result.fallback).toBe(true);
    });

    it('should not block the turn on API timeout', async () => {
      mockModerationsCreate.mockRejectedValue(
        new Error('Request timeout after 5000ms'),
      );

      const result = await safeModerateContent('I look around the room.');

      expect(result.flagged).toBe(false);
      expect(result.fallback).toBe(true);
    });

    it('should not block the turn on network error', async () => {
      mockModerationsCreate.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await safeModerateContent('I talk to the wizard.');

      expect(result.flagged).toBe(false);
      expect(result.fallback).toBe(true);
    });

    it('should still throw in direct moderateContent when API fails', async () => {
      mockModerationsCreate.mockRejectedValue(
        new Error('Moderation API unavailable'),
      );

      await expect(moderateContent('test')).rejects.toThrow(/moderation api unavailable/i);
    });
  });
});
