/**
 * Tests for Content Moderation middleware.
 */

// Set environment before imports
process.env.NODE_ENV = 'development';
process.env.PORT = '0';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/questcast_test';
process.env.OPENAI_API_KEY = 'sk-test-fake-key-for-testing-only';
process.env.JWT_SECRET = 'test-jwt-secret-that-is-at-least-32-characters-long';
process.env.CORS_ORIGIN = '*';

// Mock logger
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
  config: {
    OPENAI_API_KEY: 'sk-test',
  },
}));

// Mock fs to provide fallback responses
jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      en: {
        generic_continue: [
          'The world flickers for a moment. What do you do next?',
          'A strange hum passes through the air. Your adventure continues.',
        ],
        error_acknowledgment: [
          'Magical energies waver. The world stabilizes. Let us continue.',
        ],
      },
      cs: {
        generic_continue: ['Svet kolem vas zakolisa. Co delate dal?'],
      },
    }),
  ),
}));

// Mock AI service
const mockModerateContent = jest.fn();
jest.mock('../../src/ai/index', () => ({
  getAIService: jest.fn(() => ({
    moderateContent: mockModerateContent,
  })),
}));

import { moderatePlayerInput, getFallbackResponses } from '../../src/middleware/content-moderation';
import { logger } from '../../src/utils/logger';

describe('moderatePlayerInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass safe content', async () => {
    mockModerateContent.mockResolvedValue({
      flagged: false,
      categories: {},
      categoryScores: {},
    });

    const result = await moderatePlayerInput('I want to explore the cave');

    expect(result.passed).toBe(true);
    expect(result.flagged).toBe(false);
    expect(result.redirectResponse).toBeUndefined();
  });

  it('should flag unsafe content and return redirect response', async () => {
    mockModerateContent.mockResolvedValue({
      flagged: true,
      categories: { violence: true },
      categoryScores: { violence: 0.95 },
    });

    const result = await moderatePlayerInput('I want to do something violent');

    expect(result.passed).toBe(false);
    expect(result.flagged).toBe(true);
    expect(result.redirectResponse).toBeTruthy();
    expect(typeof result.redirectResponse).toBe('string');
  });

  it('should log flagged categories', async () => {
    mockModerateContent.mockResolvedValue({
      flagged: true,
      categories: { violence: true, 'violence/graphic': true },
      categoryScores: { violence: 0.9, 'violence/graphic': 0.8 },
    });

    await moderatePlayerInput('violent content');

    expect(logger.warn).toHaveBeenCalledWith(
      'Player input flagged by moderation',
      expect.objectContaining({
        flaggedCategories: expect.arrayContaining(['violence', 'violence/graphic']),
      }),
    );
  });

  it('should use appropriate fallback category for violence', async () => {
    mockModerateContent.mockResolvedValue({
      flagged: true,
      categories: { violence: true },
      categoryScores: { violence: 0.95 },
    });

    const result = await moderatePlayerInput('violent content', 'en');

    // Should use error_acknowledgment category for violence
    expect(result.redirectResponse).toBeTruthy();
  });

  it('should handle different languages', async () => {
    mockModerateContent.mockResolvedValue({
      flagged: true,
      categories: { sexual: true },
      categoryScores: { sexual: 0.9 },
    });

    const result = await moderatePlayerInput('inappropriate content', 'cs');

    expect(result.passed).toBe(false);
    expect(result.redirectResponse).toBeTruthy();
  });
});

describe('getFallbackResponses', () => {
  it('should return loaded fallback responses', () => {
    const responses = getFallbackResponses();

    expect(responses).toHaveProperty('en');
    expect(responses).toHaveProperty('cs');
    expect(responses.en).toHaveProperty('generic_continue');
  });
});
