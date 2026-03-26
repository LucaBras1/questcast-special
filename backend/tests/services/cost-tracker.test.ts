/**
 * Cost Tracker -- Test Suite
 *
 * Tests for:
 * - Per-turn cost calculation with known token counts
 * - Session cost aggregation
 * - Daily cost alerting threshold
 * - Cost breakdown: STT, LLM input, LLM output, TTS, image all separate
 */

import { calculateTotalCost, OPENAI_PRICING } from '../../src/ai/types';

// ---- Cost Tracker Simulation ----

interface TurnCost {
  turnNumber: number;
  sttCost: number;
  llmInputCost: number;
  llmOutputCost: number;
  ttsCost: number;
  imageCost: number;
  totalCost: number;
}

class CostTracker {
  private turnCosts: TurnCost[] = [];
  private dailyAlertThreshold: number;

  constructor(dailyAlertThreshold: number = 10.0) {
    this.dailyAlertThreshold = dailyAlertThreshold;
  }

  recordTurn(turnNumber: number, costs: Partial<TurnCost>): TurnCost {
    const computed = calculateTotalCost({
      sttCost: costs.sttCost ?? 0,
      llmInputCost: costs.llmInputCost ?? 0,
      llmOutputCost: costs.llmOutputCost ?? 0,
      ttsCost: costs.ttsCost ?? 0,
      imageCost: costs.imageCost ?? 0,
    });

    const turnCost: TurnCost = {
      turnNumber,
      ...computed,
    };

    this.turnCosts.push(turnCost);
    return turnCost;
  }

  getSessionTotal(): number {
    return this.turnCosts.reduce((sum, tc) => sum + tc.totalCost, 0);
  }

  getTurnCosts(): TurnCost[] {
    return [...this.turnCosts];
  }

  isDailyAlertTriggered(dailyTotal: number): boolean {
    return dailyTotal >= this.dailyAlertThreshold;
  }

  reset(): void {
    this.turnCosts = [];
  }
}

// ---- Tests ----

describe('Cost Tracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker(10.0);
  });

  // ================================================================
  // Per-Turn Cost Calculation
  // ================================================================

  describe('Per-turn cost calculation', () => {
    it('should calculate cost correctly with known token counts', () => {
      const sttCost = (5 / 60) * OPENAI_PRICING.whisperPerMinute;
      const llmInputCost = (200 / 1000) * OPENAI_PRICING.gpt4oMiniInputPer1k;
      const llmOutputCost = (100 / 1000) * OPENAI_PRICING.gpt4oMiniOutputPer1k;
      const ttsCost = 500 * OPENAI_PRICING.ttsPerCharacter;

      const result = tracker.recordTurn(1, {
        sttCost,
        llmInputCost,
        llmOutputCost,
        ttsCost,
      });

      expect(result.sttCost).toBeCloseTo(sttCost, 6);
      expect(result.llmInputCost).toBeCloseTo(llmInputCost, 6);
      expect(result.llmOutputCost).toBeCloseTo(llmOutputCost, 6);
      expect(result.ttsCost).toBeCloseTo(ttsCost, 6);
      expect(result.totalCost).toBeCloseTo(
        sttCost + llmInputCost + llmOutputCost + ttsCost,
        6,
      );
    });

    it('should calculate typical turn cost well under $0.02', () => {
      const sttCost = (5 / 60) * OPENAI_PRICING.whisperPerMinute;
      const llmInputCost = (500 / 1000) * OPENAI_PRICING.gpt4oMiniInputPer1k;
      const llmOutputCost = (100 / 1000) * OPENAI_PRICING.gpt4oMiniOutputPer1k;
      const ttsCost = 500 * OPENAI_PRICING.ttsPerCharacter;

      const result = calculateTotalCost({
        sttCost,
        llmInputCost,
        llmOutputCost,
        ttsCost,
        imageCost: 0,
      });

      expect(result.totalCost).toBeLessThan(0.02);
      // 30-turn session should be under $0.60
      expect(result.totalCost * 30).toBeLessThan(0.60);
    });

    it('should handle turn with zero costs', () => {
      const result = tracker.recordTurn(1, {});

      expect(result.totalCost).toBe(0);
      expect(result.sttCost).toBe(0);
      expect(result.llmInputCost).toBe(0);
      expect(result.llmOutputCost).toBe(0);
      expect(result.ttsCost).toBe(0);
      expect(result.imageCost).toBe(0);
    });

    it('should include image cost when image is generated', () => {
      const result = tracker.recordTurn(1, {
        sttCost: 0.001,
        llmInputCost: 0.002,
        llmOutputCost: 0.003,
        ttsCost: 0.004,
        imageCost: OPENAI_PRICING.dallePerImage,
      });

      expect(result.imageCost).toBe(OPENAI_PRICING.dallePerImage);
      expect(result.totalCost).toBeCloseTo(0.01 + OPENAI_PRICING.dallePerImage, 6);
    });
  });

  // ================================================================
  // Session Cost Aggregation
  // ================================================================

  describe('Session cost aggregation', () => {
    it('should aggregate costs across multiple turns', () => {
      tracker.recordTurn(1, { sttCost: 0.001, llmInputCost: 0.002, ttsCost: 0.003 });
      tracker.recordTurn(2, { sttCost: 0.001, llmInputCost: 0.002, ttsCost: 0.003 });
      tracker.recordTurn(3, { sttCost: 0.001, llmInputCost: 0.002, ttsCost: 0.003 });

      const sessionTotal = tracker.getSessionTotal();
      expect(sessionTotal).toBeCloseTo(0.018, 6);
    });

    it('should return zero for empty session', () => {
      expect(tracker.getSessionTotal()).toBe(0);
    });

    it('should track individual turn costs separately', () => {
      tracker.recordTurn(1, { sttCost: 0.001, llmInputCost: 0.001 });
      tracker.recordTurn(2, { sttCost: 0.002, llmInputCost: 0.002 });

      const costs = tracker.getTurnCosts();

      expect(costs).toHaveLength(2);
      expect(costs[0].turnNumber).toBe(1);
      expect(costs[0].totalCost).toBeCloseTo(0.002, 6);
      expect(costs[1].turnNumber).toBe(2);
      expect(costs[1].totalCost).toBeCloseTo(0.004, 6);
    });

    it('should handle a full 30-turn session', () => {
      for (let i = 1; i <= 30; i++) {
        tracker.recordTurn(i, {
          sttCost: 0.0005,
          llmInputCost: 0.0003,
          llmOutputCost: 0.0006,
          ttsCost: 0.0075,
        });
      }

      const total = tracker.getSessionTotal();
      const costs = tracker.getTurnCosts();

      expect(costs).toHaveLength(30);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThan(1.0);
    });
  });

  // ================================================================
  // Daily Cost Alerting
  // ================================================================

  describe('Daily cost alerting', () => {
    it('should trigger alert when daily threshold exceeded', () => {
      expect(tracker.isDailyAlertTriggered(10.5)).toBe(true);
    });

    it('should not trigger alert when under threshold', () => {
      expect(tracker.isDailyAlertTriggered(5.0)).toBe(false);
    });

    it('should trigger alert at exactly the threshold', () => {
      expect(tracker.isDailyAlertTriggered(10.0)).toBe(true);
    });

    it('should use configurable threshold', () => {
      const strictTracker = new CostTracker(5.0);
      expect(strictTracker.isDailyAlertTriggered(5.0)).toBe(true);
      expect(strictTracker.isDailyAlertTriggered(4.99)).toBe(false);
    });
  });

  // ================================================================
  // Cost Breakdown
  // ================================================================

  describe('Cost breakdown', () => {
    it('should keep all cost categories separate', () => {
      const result = calculateTotalCost({
        sttCost: 0.001,
        llmInputCost: 0.002,
        llmOutputCost: 0.003,
        ttsCost: 0.004,
        imageCost: 0.04,
      });

      expect(result.sttCost).toBe(0.001);
      expect(result.llmInputCost).toBe(0.002);
      expect(result.llmOutputCost).toBe(0.003);
      expect(result.ttsCost).toBe(0.004);
      expect(result.imageCost).toBe(0.04);
      expect(result.totalCost).toBeCloseTo(0.05, 6);
    });

    it('should default missing cost fields to zero', () => {
      const result = calculateTotalCost({ sttCost: 0.005 });

      expect(result.sttCost).toBe(0.005);
      expect(result.llmInputCost).toBe(0);
      expect(result.llmOutputCost).toBe(0);
      expect(result.ttsCost).toBe(0);
      expect(result.imageCost).toBe(0);
      expect(result.totalCost).toBe(0.005);
    });

    it('should handle completely empty cost object', () => {
      const result = calculateTotalCost({});
      expect(result.totalCost).toBe(0);
    });
  });

  // ================================================================
  // Pricing Constants Verification
  // ================================================================

  describe('Pricing constants', () => {
    it('should have correct Whisper pricing ($0.006/min)', () => {
      expect(OPENAI_PRICING.whisperPerMinute).toBe(0.006);
    });

    it('should have correct GPT-4o-mini input pricing ($0.15/1M tokens)', () => {
      expect(OPENAI_PRICING.gpt4oMiniInputPer1k).toBe(0.00015);
    });

    it('should have correct GPT-4o-mini output pricing ($0.60/1M tokens)', () => {
      expect(OPENAI_PRICING.gpt4oMiniOutputPer1k).toBe(0.0006);
    });

    it('should have correct TTS pricing ($15/1M chars)', () => {
      expect(OPENAI_PRICING.ttsPerCharacter).toBe(0.000015);
    });

    it('should have correct DALL-E pricing ($0.04/image)', () => {
      expect(OPENAI_PRICING.dallePerImage).toBe(0.04);
    });
  });
});
