/**
 * AI service type definitions.
 * Mirrors shared AICost type but kept locally for backend independence.
 */

export interface AICost {
  sttCost: number;
  llmInputCost: number;
  llmOutputCost: number;
  ttsCost: number;
  imageCost: number;
  totalCost: number;
}

export function calculateTotalCost(partial: Partial<AICost>): AICost {
  const cost: AICost = {
    sttCost: partial.sttCost ?? 0,
    llmInputCost: partial.llmInputCost ?? 0,
    llmOutputCost: partial.llmOutputCost ?? 0,
    ttsCost: partial.ttsCost ?? 0,
    imageCost: partial.imageCost ?? 0,
    totalCost: 0,
  };
  cost.totalCost =
    cost.sttCost + cost.llmInputCost + cost.llmOutputCost + cost.ttsCost + cost.imageCost;
  return cost;
}

// Pricing constants (USD) -- update when OpenAI changes pricing
export const OPENAI_PRICING = {
  // Whisper: $0.006 per minute
  whisperPerMinute: 0.006,
  // GPT-4o-mini: $0.15 per 1M input tokens, $0.60 per 1M output tokens
  gpt4oMiniInputPer1k: 0.00015,
  gpt4oMiniOutputPer1k: 0.0006,
  // TTS: $15 per 1M characters
  ttsPerCharacter: 0.000015,
  // DALL-E 3: $0.04 per image (1024x1024, standard)
  dallePerImage: 0.04,
} as const;
