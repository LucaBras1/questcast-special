/**
 * Analytics Service -- Test Suite
 *
 * Tests for:
 * - Event logging: session_start, session_end, turn_completed, dice_rolled, combat events, errors
 * - Event structure: timestamp, userId, sessionId, event data
 * - Missing optional fields handled gracefully
 * - Batch events written to log
 */

import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

const LOGS_DIR = join(process.cwd(), 'logs');
const ANALYTICS_LOG_FILE = join(LOGS_DIR, 'analytics.jsonl');

// Import analytics functions
import {
  trackEvent,
  trackSessionStart,
  trackSessionEnd,
  trackTurnCompleted,
  trackDiceRolled,
  trackCombatStarted,
  trackCombatEnded,
  trackImageGenerated,
  trackError,
  type AnalyticsEvent,
} from '../../src/services/analytics';

// ---- Helpers ----

function readAnalyticsLog(): AnalyticsEvent[] {
  if (!existsSync(ANALYTICS_LOG_FILE)) return [];
  const content = readFileSync(ANALYTICS_LOG_FILE, 'utf-8');
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function cleanLogs(): void {
  try {
    if (existsSync(ANALYTICS_LOG_FILE)) {
      rmSync(ANALYTICS_LOG_FILE);
    }
  } catch {
    // ignore cleanup errors
  }
}

// ---- Test Suite ----

describe('Analytics Service', () => {
  beforeEach(() => {
    cleanLogs();
  });

  afterAll(() => {
    cleanLogs();
  });

  // ================================================================
  // Event Logging
  // ================================================================

  describe('event logging', () => {
    it('should log session_start event', () => {
      trackSessionStart('user-1', 'session-1', 'warrior', 'cs');

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('session_start');
      expect(events[0].userId).toBe('user-1');
      expect(events[0].sessionId).toBe('session-1');
      expect((events[0] as any).data.characterClass).toBe('warrior');
      expect((events[0] as any).data.language).toBe('cs');
    });

    it('should log session_end event', () => {
      trackSessionEnd('user-1', 'session-1', 15, 30, 'manual');

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('session_end');
      expect((events[0] as any).data.turnsPlayed).toBe(15);
      expect((events[0] as any).data.durationMinutes).toBe(30);
      expect((events[0] as any).data.endReason).toBe('manual');
    });

    it('should log turn_completed event', () => {
      trackTurnCompleted('session-1', 'user-1', 5, 1500, 0.002, 'en');

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('turn_completed');
      expect((events[0] as any).data.turnNumber).toBe(5);
      expect((events[0] as any).data.latencyMs).toBe(1500);
      expect((events[0] as any).data.cost).toBe(0.002);
    });

    it('should log dice_rolled event', () => {
      trackDiceRolled('session-1', 'user-1', 'd20', 17, true);

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('dice_rolled');
      expect((events[0] as any).data.diceType).toBe('d20');
      expect((events[0] as any).data.result).toBe(17);
      expect((events[0] as any).data.success).toBe(true);
    });

    it('should log combat_started event', () => {
      trackCombatStarted('session-1', 'user-1', 'goblin');

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('combat_started');
      expect((events[0] as any).data.enemyType).toBe('goblin');
    });

    it('should log combat_ended event', () => {
      trackCombatEnded('session-1', 'user-1', 'troll', 'victory', 5);

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('combat_ended');
      expect((events[0] as any).data.enemyType).toBe('troll');
      expect((events[0] as any).data.outcome).toBe('victory');
      expect((events[0] as any).data.rounds).toBe(5);
    });

    it('should log image_generated event', () => {
      trackImageGenerated('session-1', 'user-1', false, 0.04);

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('image_generated');
      expect((events[0] as any).data.cached).toBe(false);
      expect((events[0] as any).data.cost).toBe(0.04);
    });

    it('should log error_occurred event', () => {
      trackError('STT_TIMEOUT', '/api/game/session/123/turn', 'user-1', 'Whisper API timed out after 10s');

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('error_occurred');
      expect((events[0] as any).data.type).toBe('STT_TIMEOUT');
      expect((events[0] as any).data.endpoint).toBe('/api/game/session/123/turn');
      expect((events[0] as any).data.details).toBe('Whisper API timed out after 10s');
    });
  });

  // ================================================================
  // Event Structure
  // ================================================================

  describe('event structure', () => {
    it('should include ISO timestamp', () => {
      trackSessionStart('user-1', 'session-1', 'mage', 'en');

      const events = readAnalyticsLog();
      expect(events[0].timestamp).toBeDefined();

      // Should be a valid ISO date string
      const date = new Date(events[0].timestamp);
      expect(date.getTime()).not.toBeNaN();
    });

    it('should include userId when provided', () => {
      trackSessionStart('user-123', 'session-1', 'rogue', 'en');

      const events = readAnalyticsLog();
      expect(events[0].userId).toBe('user-123');
    });

    it('should include sessionId when provided', () => {
      trackSessionStart('user-1', 'session-abc', 'ranger', 'cs');

      const events = readAnalyticsLog();
      expect(events[0].sessionId).toBe('session-abc');
    });

    it('should write events as valid JSON lines', () => {
      trackSessionStart('user-1', 'session-1', 'warrior', 'en');
      trackTurnCompleted('session-1', 'user-1', 1, 2000, 0.001, 'en');

      const content = readFileSync(ANALYTICS_LOG_FILE, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      expect(lines).toHaveLength(2);

      // Each line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });
  });

  // ================================================================
  // Missing Optional Fields
  // ================================================================

  describe('missing optional fields', () => {
    it('should handle error event without userId', () => {
      trackError('UNKNOWN', '/api/health');

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBeUndefined();
    });

    it('should handle error event without details', () => {
      trackError('TIMEOUT', '/api/game/session/1/turn', 'user-1');

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect((events[0] as any).data.details).toBeUndefined();
    });

    it('should handle trackEvent with minimal fields', () => {
      trackEvent({
        event: 'error_occurred',
        data: { type: 'test', endpoint: '/test' },
      });

      const events = readAnalyticsLog();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('error_occurred');
      expect(events[0].userId).toBeUndefined();
      expect(events[0].sessionId).toBeUndefined();
    });
  });

  // ================================================================
  // Batch Events
  // ================================================================

  describe('batch events written to log', () => {
    it('should write multiple events sequentially', () => {
      trackSessionStart('user-1', 'session-1', 'warrior', 'en');
      trackTurnCompleted('session-1', 'user-1', 1, 1800, 0.001, 'en');
      trackDiceRolled('session-1', 'user-1', 'd20', 15, true);
      trackCombatStarted('session-1', 'user-1', 'goblin');
      trackCombatEnded('session-1', 'user-1', 'goblin', 'victory', 3);
      trackSessionEnd('user-1', 'session-1', 2, 10, 'manual');

      const events = readAnalyticsLog();
      expect(events).toHaveLength(6);

      // Verify event order
      expect(events[0].event).toBe('session_start');
      expect(events[1].event).toBe('turn_completed');
      expect(events[2].event).toBe('dice_rolled');
      expect(events[3].event).toBe('combat_started');
      expect(events[4].event).toBe('combat_ended');
      expect(events[5].event).toBe('session_end');
    });

    it('should maintain data integrity across batch writes', () => {
      // Write 20 events in rapid succession
      for (let i = 0; i < 20; i++) {
        trackTurnCompleted(`session-${i}`, `user-${i}`, i + 1, 1000 + i, 0.001, 'en');
      }

      const events = readAnalyticsLog();
      expect(events).toHaveLength(20);

      // Each event should have unique data
      for (let i = 0; i < 20; i++) {
        expect(events[i].sessionId).toBe(`session-${i}`);
        expect((events[i] as any).data.turnNumber).toBe(i + 1);
      }
    });
  });

  // ================================================================
  // All Event Types
  // ================================================================

  describe('all event types', () => {
    it('should support all 8 event types', () => {
      const eventTypes = [
        'session_start',
        'session_end',
        'turn_completed',
        'dice_rolled',
        'combat_started',
        'combat_ended',
        'image_generated',
        'error_occurred',
      ];

      trackSessionStart('u', 's', 'warrior', 'en');
      trackSessionEnd('u', 's', 1, 1, 'manual');
      trackTurnCompleted('s', 'u', 1, 100, 0, 'en');
      trackDiceRolled('s', 'u', 'd20', 10, true);
      trackCombatStarted('s', 'u', 'goblin');
      trackCombatEnded('s', 'u', 'goblin', 'victory', 1);
      trackImageGenerated('s', 'u', false, 0.04);
      trackError('test', '/test', 'u');

      const events = readAnalyticsLog();
      expect(events).toHaveLength(8);

      const loggedTypes = events.map((e) => e.event);
      for (const type of eventTypes) {
        expect(loggedTypes).toContain(type);
      }
    });
  });
});
