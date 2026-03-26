/**
 * Analytics Event Service.
 *
 * Tracks structured events for monitoring, debugging, and product analytics.
 * Writes to structured JSON log and optionally batches to PostHog server-side API.
 *
 * Events tracked:
 *   - session_start / session_end
 *   - turn_completed
 *   - dice_rolled
 *   - combat_started / combat_ended
 *   - image_generated
 *   - error_occurred
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';

// ---- Event Types ----

export type AnalyticsEventType =
  | 'session_start'
  | 'session_end'
  | 'turn_completed'
  | 'dice_rolled'
  | 'combat_started'
  | 'combat_ended'
  | 'image_generated'
  | 'error_occurred';

export interface BaseEvent {
  event: AnalyticsEventType;
  timestamp: string;
  userId?: string;
  sessionId?: string;
}

export interface SessionStartEvent extends BaseEvent {
  event: 'session_start';
  data: {
    characterClass: string;
    language: string;
  };
}

export interface SessionEndEvent extends BaseEvent {
  event: 'session_end';
  data: {
    turnsPlayed: number;
    durationMinutes: number;
    endReason: 'manual' | 'timeout' | 'error' | 'completed';
  };
}

export interface TurnCompletedEvent extends BaseEvent {
  event: 'turn_completed';
  data: {
    turnNumber: number;
    latencyMs: number;
    cost: number;
    language: string;
  };
}

export interface DiceRolledEvent extends BaseEvent {
  event: 'dice_rolled';
  data: {
    diceType: string;
    result: number;
    success: boolean;
  };
}

export interface CombatStartedEvent extends BaseEvent {
  event: 'combat_started';
  data: {
    enemyType: string;
  };
}

export interface CombatEndedEvent extends BaseEvent {
  event: 'combat_ended';
  data: {
    enemyType: string;
    outcome: 'victory' | 'defeat' | 'flee' | 'draw';
    rounds: number;
  };
}

export interface ImageGeneratedEvent extends BaseEvent {
  event: 'image_generated';
  data: {
    cached: boolean;
    cost: number;
  };
}

export interface ErrorOccurredEvent extends BaseEvent {
  event: 'error_occurred';
  data: {
    type: string;
    endpoint: string;
    details?: string;
  };
}

export type AnalyticsEvent =
  | SessionStartEvent
  | SessionEndEvent
  | TurnCompletedEvent
  | DiceRolledEvent
  | CombatStartedEvent
  | CombatEndedEvent
  | ImageGeneratedEvent
  | ErrorOccurredEvent;

// ---- Analytics Service ----

const LOGS_DIR = join(process.cwd(), 'logs');
const ANALYTICS_LOG_FILE = join(LOGS_DIR, 'analytics.jsonl');

// PostHog batch buffer
const POSTHOG_BATCH_SIZE = 10;
const POSTHOG_FLUSH_INTERVAL_MS = 30_000; // 30 seconds

let eventBuffer: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function ensureLogsDir(): void {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Write an analytics event to structured JSON log file.
 */
function writeToLog(event: AnalyticsEvent): void {
  try {
    ensureLogsDir();
    const line = JSON.stringify(event) + '\n';
    appendFileSync(ANALYTICS_LOG_FILE, line, 'utf-8');
  } catch (error) {
    logger.error('Failed to write analytics event to log', { event: event.event, error });
  }
}

/**
 * Send events to PostHog (optional, non-blocking).
 * Only sends if POSTHOG_API_KEY is configured.
 */
async function flushToPostHog(): Promise<void> {
  if (eventBuffer.length === 0) return;

  const posthogApiKey = process.env.POSTHOG_API_KEY;
  const posthogHost = process.env.POSTHOG_HOST ?? 'https://app.posthog.com';

  if (!posthogApiKey) {
    eventBuffer = [];
    return;
  }

  const batch = [...eventBuffer];
  eventBuffer = [];

  try {
    const events = batch.map((evt) => ({
      event: evt.event,
      properties: {
        ...('data' in evt ? evt.data : {}),
        sessionId: evt.sessionId,
        $lib: 'questcast-backend',
      },
      distinct_id: evt.userId ?? 'anonymous',
      timestamp: evt.timestamp,
    }));

    const response = await fetch(`${posthogHost}/batch/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: posthogApiKey,
        batch: events,
      }),
    });

    if (!response.ok) {
      logger.warn('PostHog batch send failed', {
        status: response.status,
        eventCount: events.length,
      });
    }
  } catch (error) {
    logger.warn('PostHog batch send error', { error, eventCount: batch.length });
  }
}

// ---- Public API ----

/**
 * Track an analytics event. Writes to log immediately and buffers for PostHog.
 */
export function trackEvent(event: Omit<AnalyticsEvent, 'timestamp'>): void {
  const fullEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  } as AnalyticsEvent;

  // Write to structured log immediately
  writeToLog(fullEvent);

  // Buffer for PostHog
  eventBuffer.push(fullEvent);

  if (eventBuffer.length >= POSTHOG_BATCH_SIZE) {
    flushToPostHog().catch(() => {
      // Already logged inside flushToPostHog
    });
  }

  logger.debug('Analytics event tracked', { event: fullEvent.event, sessionId: fullEvent.sessionId });
}

// ---- Convenience Methods ----

export function trackSessionStart(userId: string, sessionId: string, characterClass: string, language: string): void {
  trackEvent({
    event: 'session_start',
    userId,
    sessionId,
    data: { characterClass, language },
  });
}

export function trackSessionEnd(
  userId: string,
  sessionId: string,
  turnsPlayed: number,
  durationMinutes: number,
  endReason: 'manual' | 'timeout' | 'error' | 'completed',
): void {
  trackEvent({
    event: 'session_end',
    userId,
    sessionId,
    data: { turnsPlayed, durationMinutes, endReason },
  });
}

export function trackTurnCompleted(
  sessionId: string,
  userId: string,
  turnNumber: number,
  latencyMs: number,
  cost: number,
  language: string,
): void {
  trackEvent({
    event: 'turn_completed',
    userId,
    sessionId,
    data: { turnNumber, latencyMs, cost, language },
  });
}

export function trackDiceRolled(
  sessionId: string,
  userId: string,
  diceType: string,
  result: number,
  success: boolean,
): void {
  trackEvent({
    event: 'dice_rolled',
    userId,
    sessionId,
    data: { diceType, result, success },
  });
}

export function trackCombatStarted(sessionId: string, userId: string, enemyType: string): void {
  trackEvent({
    event: 'combat_started',
    userId,
    sessionId,
    data: { enemyType },
  });
}

export function trackCombatEnded(
  sessionId: string,
  userId: string,
  enemyType: string,
  outcome: 'victory' | 'defeat' | 'flee' | 'draw',
  rounds: number,
): void {
  trackEvent({
    event: 'combat_ended',
    userId,
    sessionId,
    data: { enemyType, outcome, rounds },
  });
}

export function trackImageGenerated(sessionId: string, userId: string, cached: boolean, cost: number): void {
  trackEvent({
    event: 'image_generated',
    userId,
    sessionId,
    data: { cached, cost },
  });
}

export function trackError(
  type: string,
  endpoint: string,
  userId?: string,
  details?: string,
): void {
  trackEvent({
    event: 'error_occurred',
    userId,
    data: { type, endpoint, details },
  });
}

/**
 * Start the PostHog flush timer. Call once at startup.
 */
export function startAnalyticsFlush(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushToPostHog().catch(() => {});
  }, POSTHOG_FLUSH_INTERVAL_MS);

  // Ensure timer doesn't prevent process exit
  if (flushTimer && typeof flushTimer === 'object' && 'unref' in flushTimer) {
    flushTimer.unref();
  }
}

/**
 * Flush remaining events and stop the timer. Call on shutdown.
 */
export async function stopAnalyticsFlush(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  await flushToPostHog();
}
