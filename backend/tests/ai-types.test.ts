import { calculateTotalCost, OPENAI_PRICING } from '../src/ai/types';

describe('AI Cost Tracking', () => {
  describe('calculateTotalCost', () => {
    it('should calculate total from all cost components', () => {
      const cost = calculateTotalCost({
        sttCost: 0.001,
        llmInputCost: 0.002,
        llmOutputCost: 0.003,
        ttsCost: 0.004,
        imageCost: 0.04,
      });

      expect(cost.totalCost).toBeCloseTo(0.05);
      expect(cost.sttCost).toBe(0.001);
      expect(cost.llmInputCost).toBe(0.002);
      expect(cost.llmOutputCost).toBe(0.003);
      expect(cost.ttsCost).toBe(0.004);
      expect(cost.imageCost).toBe(0.04);
    });

    it('should default missing costs to 0', () => {
      const cost = calculateTotalCost({ sttCost: 0.001 });

      expect(cost.totalCost).toBeCloseTo(0.001);
      expect(cost.llmInputCost).toBe(0);
      expect(cost.ttsCost).toBe(0);
    });

    it('should handle empty input', () => {
      const cost = calculateTotalCost({});

      expect(cost.totalCost).toBe(0);
    });
  });

  describe('OPENAI_PRICING', () => {
    it('should have reasonable pricing constants', () => {
      expect(OPENAI_PRICING.whisperPerMinute).toBeGreaterThan(0);
      expect(OPENAI_PRICING.gpt4oMiniInputPer1k).toBeGreaterThan(0);
      expect(OPENAI_PRICING.gpt4oMiniOutputPer1k).toBeGreaterThan(0);
      expect(OPENAI_PRICING.ttsPerCharacter).toBeGreaterThan(0);
      expect(OPENAI_PRICING.dallePerImage).toBeGreaterThan(0);
    });

    it('should have output tokens more expensive than input tokens (GPT-4o-mini)', () => {
      expect(OPENAI_PRICING.gpt4oMiniOutputPer1k).toBeGreaterThan(
        OPENAI_PRICING.gpt4oMiniInputPer1k,
      );
    });
  });
});
