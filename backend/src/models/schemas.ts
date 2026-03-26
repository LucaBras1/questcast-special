import { z } from 'zod';

// ---- Auth Schemas ----

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  displayName: z.string().min(1, 'Display name is required').max(100),
  language: z.enum(['cs', 'en']).default('en'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ---- Character Schemas ----

export const createCharacterSchema = z.object({
  name: z.string().min(1, 'Character name is required').max(50),
  class: z.enum(['warrior', 'mage', 'rogue', 'ranger']),
});

// ---- Game Session Schemas ----

export const createSessionSchema = z.object({
  characterName: z.string().min(1).max(50),
  characterClass: z.enum(['warrior', 'mage', 'rogue', 'ranger']),
  language: z.enum(['cs', 'en']).default('en'),
});

export const sessionIdParamSchema = z.object({
  id: z.string().uuid('Invalid session ID'),
});

// ---- AI Response Schemas ----

/**
 * Schema for validating structured JSON responses from the LLM.
 * Used to validate that GPT-4o-mini returns properly formatted game data.
 */
export const llmNarrationResponseSchema = z.object({
  narration: z.string().min(1),
  stateUpdates: z
    .object({
      healthChange: z.number().optional(),
      goldChange: z.number().optional(),
      inventoryAdd: z.array(z.string()).optional(),
      inventoryRemove: z.array(z.string()).optional(),
      locationChange: z.string().optional(),
      questUpdate: z.string().optional(),
      questProgress: z.number().min(0).max(100).optional(),
      npcMet: z.string().optional(),
      keyDecision: z.string().optional(),
      threatLevel: z.enum(['low', 'moderate', 'high', 'critical']).optional(),
      timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']).optional(),
    })
    .optional(),
  suggestedActions: z.array(z.string()).max(3).optional(),
  requiresDiceRoll: z.boolean().optional(),
  diceRollReason: z.string().optional(),
  shouldGenerateImage: z.boolean().optional(),
  imagePrompt: z.string().optional(),
});

export const llmDiceInterpretationSchema = z.object({
  narration: z.string().min(1),
  outcome: z.enum(['critical_success', 'success', 'partial', 'failure', 'critical_failure']),
  stateUpdates: z
    .object({
      healthChange: z.number().optional(),
      goldChange: z.number().optional(),
      inventoryAdd: z.array(z.string()).optional(),
      inventoryRemove: z.array(z.string()).optional(),
    })
    .optional(),
});

export const llmSummarySchema = z.object({
  summary: z.string().min(1).max(500),
});

// ---- Turn Request Schema ----

/**
 * Schema for POST /api/game/session/:id/turn
 * Either audioBase64 or textInput must be provided.
 */
export const turnRequestSchema = z
  .object({
    audioBase64: z.string().optional(),
    textInput: z.string().max(1000).optional(),
  })
  .refine((data) => data.audioBase64 || data.textInput, {
    message: 'Either audioBase64 or textInput must be provided',
  });

// ---- Session Status Schema ----

export const updateSessionStatusSchema = z.object({
  status: z.enum(['active', 'paused', 'completed']),
});

// ---- API Response Schemas ----

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

// ---- Dice Roll Schema ----

export const diceRollRequestSchema = z.object({
  diceType: z.enum(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']),
  actionType: z.string().min(1).max(50),
  modifiers: z.number().int().min(-20).max(20).default(0),
});

// ---- Image Generation Schemas ----

export const imageRequestSchema = z.object({
  sceneDescription: z.string().min(10, 'Scene description must be at least 10 characters').max(500),
  artStyle: z.enum(['epic_fantasy', 'dark_atmospheric', 'storybook', 'painterly']),
});

// ---- User Profile Update Schema ----

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  language: z.enum(['cs', 'en']).optional(),
  contentRating: z.enum(['family', 'teen', 'mature']).optional(),
});

// ---- Type exports ----

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type TurnRequestInput = z.infer<typeof turnRequestSchema>;
export type UpdateSessionStatusInput = z.infer<typeof updateSessionStatusSchema>;
export type LLMNarrationResponse = z.infer<typeof llmNarrationResponseSchema>;
export type DiceRollRequestInput = z.infer<typeof diceRollRequestSchema>;
export type LLMDiceInterpretation = z.infer<typeof llmDiceInterpretationSchema>;
export type LLMSummary = z.infer<typeof llmSummarySchema>;
export type ImageRequestInput = z.infer<typeof imageRequestSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
