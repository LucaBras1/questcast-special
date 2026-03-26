import type { AICost } from '../ai/types.js';
import { calculateTotalCost } from '../ai/types.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';

/**
 * Cost Tracker Service.
 * Tracks AI operation costs per turn, per session, and per user.
 * Stores costs in game_events.aiCost JSON column.
 * Logs daily cost summaries and alerts if threshold is exceeded.
 */

// ---- In-memory daily cost accumulator ----

interface DailyCostAccumulator {
  date: string; // YYYY-MM-DD
  totalCost: number;
  operationCounts: {
    stt: number;
    llm: number;
    tts: number;
    image: number;
    moderation: number;
  };
  sessionCosts: Map<string, number>;
  userCosts: Map<string, number>;
  alertSent: boolean;
}

let _dailyCost: DailyCostAccumulator | null = null;

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

function getDailyAccumulator(): DailyCostAccumulator {
  const today = getTodayString();
  if (!_dailyCost || _dailyCost.date !== today) {
    if (_dailyCost) {
      // Log previous day summary
      logDailySummary(_dailyCost);
    }
    _dailyCost = {
      date: today,
      totalCost: 0,
      operationCounts: { stt: 0, llm: 0, tts: 0, image: 0, moderation: 0 },
      sessionCosts: new Map(),
      userCosts: new Map(),
      alertSent: false,
    };
  }
  return _dailyCost;
}

function logDailySummary(acc: DailyCostAccumulator): void {
  logger.info('Daily AI cost summary', {
    date: acc.date,
    totalCost: acc.totalCost.toFixed(4),
    operations: acc.operationCounts,
    uniqueSessions: acc.sessionCosts.size,
    uniqueUsers: acc.userCosts.size,
  });
}

// ---- Turn Cost Builder ----

/**
 * Accumulates costs for a single turn through multiple AI operations.
 */
export class TurnCostTracker {
  private costs: Partial<AICost> = {};
  private readonly sessionId: string;
  private readonly userId: string;
  private readonly turnNumber: number;
  private readonly startTime: number;

  constructor(sessionId: string, userId: string, turnNumber: number) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.turnNumber = turnNumber;
    this.startTime = Date.now();
  }

  addSTTCost(cost: number): void {
    this.costs.sttCost = (this.costs.sttCost ?? 0) + cost;
    getDailyAccumulator().operationCounts.stt++;
  }

  addLLMCost(inputCost: number, outputCost: number): void {
    this.costs.llmInputCost = (this.costs.llmInputCost ?? 0) + inputCost;
    this.costs.llmOutputCost = (this.costs.llmOutputCost ?? 0) + outputCost;
    getDailyAccumulator().operationCounts.llm++;
  }

  addTTSCost(cost: number): void {
    this.costs.ttsCost = (this.costs.ttsCost ?? 0) + cost;
    getDailyAccumulator().operationCounts.tts++;
  }

  addImageCost(cost: number): void {
    this.costs.imageCost = (this.costs.imageCost ?? 0) + cost;
    getDailyAccumulator().operationCounts.image++;
  }

  addModerationCost(): void {
    // Moderation API is free, but track the call count
    getDailyAccumulator().operationCounts.moderation++;
  }

  /**
   * Finalize the turn cost and update daily accumulators.
   * Returns the complete AICost object with totalCost calculated.
   */
  finalize(): AICost & { latencyMs: number } {
    const finalCost = calculateTotalCost(this.costs);
    const latencyMs = Date.now() - this.startTime;

    // Update daily accumulator
    const daily = getDailyAccumulator();
    daily.totalCost += finalCost.totalCost;

    const prevSessionCost = daily.sessionCosts.get(this.sessionId) ?? 0;
    daily.sessionCosts.set(this.sessionId, prevSessionCost + finalCost.totalCost);

    const prevUserCost = daily.userCosts.get(this.userId) ?? 0;
    daily.userCosts.set(this.userId, prevUserCost + finalCost.totalCost);

    // Check alert threshold
    if (!daily.alertSent && daily.totalCost >= config.DAILY_AI_COST_ALERT_THRESHOLD) {
      daily.alertSent = true;
      logger.error('DAILY AI COST ALERT: Threshold exceeded!', {
        date: daily.date,
        currentCost: daily.totalCost.toFixed(4),
        threshold: config.DAILY_AI_COST_ALERT_THRESHOLD,
        uniqueSessions: daily.sessionCosts.size,
        uniqueUsers: daily.userCosts.size,
      });
    }

    logger.info('Turn cost finalized', {
      sessionId: this.sessionId,
      turnNumber: this.turnNumber,
      cost: finalCost,
      latencyMs,
    });

    return { ...finalCost, latencyMs };
  }

  /**
   * Get the current accumulated cost without finalizing.
   */
  getCurrentCost(): AICost {
    return calculateTotalCost(this.costs);
  }
}

/**
 * Get the current daily cost total for monitoring.
 */
export function getDailyCostTotal(): { date: string; totalCost: number; sessions: number; users: number } {
  const daily = getDailyAccumulator();
  return {
    date: daily.date,
    totalCost: daily.totalCost,
    sessions: daily.sessionCosts.size,
    users: daily.userCosts.size,
  };
}
