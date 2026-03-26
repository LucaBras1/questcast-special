/**
 * Performance / Latency Tracker -- Test Suite
 *
 * Tests for:
 * - Latency measurement accuracy with mock timestamps
 * - Latency classification: <1.5s=excellent, <2s=good, <3s=acceptable, >3s=poor
 * - Telemetry payload format for PostHog
 */

// ---- Latency Tracker Implementation ----

type LatencyClassification = 'excellent' | 'good' | 'acceptable' | 'poor';

interface LatencyMeasurement {
  /** Total latency in milliseconds (mic release -> first audio play) */
  totalMs: number;
  /** Breakdown by stage */
  stages: {
    sttMs: number;
    moderationMs: number;
    llmMs: number;
    ttsMs: number;
    networkMs: number;
  };
  /** Classification based on total latency */
  classification: LatencyClassification;
}

interface TelemetryPayload {
  event: string;
  properties: {
    session_id: string;
    turn_number: number;
    total_latency_ms: number;
    stt_latency_ms: number;
    moderation_latency_ms: number;
    llm_latency_ms: number;
    tts_latency_ms: number;
    network_latency_ms: number;
    classification: LatencyClassification;
    timestamp: string;
  };
}

function classifyLatency(totalMs: number): LatencyClassification {
  const seconds = totalMs / 1000;
  if (seconds < 1.5) return 'excellent';
  if (seconds < 2.0) return 'good';
  if (seconds < 3.0) return 'acceptable';
  return 'poor';
}

function measureLatency(stages: LatencyMeasurement['stages']): LatencyMeasurement {
  const totalMs =
    stages.sttMs + stages.moderationMs + stages.llmMs + stages.ttsMs + stages.networkMs;

  return {
    totalMs,
    stages,
    classification: classifyLatency(totalMs),
  };
}

function buildTelemetryPayload(
  sessionId: string,
  turnNumber: number,
  measurement: LatencyMeasurement,
): TelemetryPayload {
  return {
    event: 'turn_latency',
    properties: {
      session_id: sessionId,
      turn_number: turnNumber,
      total_latency_ms: measurement.totalMs,
      stt_latency_ms: measurement.stages.sttMs,
      moderation_latency_ms: measurement.stages.moderationMs,
      llm_latency_ms: measurement.stages.llmMs,
      tts_latency_ms: measurement.stages.ttsMs,
      network_latency_ms: measurement.stages.networkMs,
      classification: measurement.classification,
      timestamp: new Date().toISOString(),
    },
  };
}

// ---- Tests ----

describe('Latency Tracker', () => {
  // ================================================================
  // Latency Measurement Accuracy
  // ================================================================

  describe('Latency measurement accuracy', () => {
    it('should calculate total latency from stage breakdowns', () => {
      const measurement = measureLatency({
        sttMs: 300,
        moderationMs: 50,
        llmMs: 800,
        ttsMs: 200,
        networkMs: 100,
      });

      expect(measurement.totalMs).toBe(1450);
    });

    it('should handle zero latency stages', () => {
      const measurement = measureLatency({
        sttMs: 0, // text input, no STT
        moderationMs: 50,
        llmMs: 500,
        ttsMs: 200,
        networkMs: 50,
      });

      expect(measurement.totalMs).toBe(800);
    });

    it('should correctly sum all stages', () => {
      const stages = {
        sttMs: 123,
        moderationMs: 45,
        llmMs: 678,
        ttsMs: 234,
        networkMs: 89,
      };

      const measurement = measureLatency(stages);
      const expectedTotal = 123 + 45 + 678 + 234 + 89;

      expect(measurement.totalMs).toBe(expectedTotal);
    });

    it('should handle very fast responses', () => {
      const measurement = measureLatency({
        sttMs: 100,
        moderationMs: 20,
        llmMs: 200,
        ttsMs: 100,
        networkMs: 30,
      });

      expect(measurement.totalMs).toBe(450);
      expect(measurement.classification).toBe('excellent');
    });

    it('should handle very slow responses', () => {
      const measurement = measureLatency({
        sttMs: 2000,
        moderationMs: 500,
        llmMs: 5000,
        ttsMs: 1000,
        networkMs: 500,
      });

      expect(measurement.totalMs).toBe(9000);
      expect(measurement.classification).toBe('poor');
    });
  });

  // ================================================================
  // Latency Classification
  // ================================================================

  describe('Latency classification', () => {
    it('should classify <1.5s as excellent', () => {
      expect(classifyLatency(500)).toBe('excellent');
      expect(classifyLatency(1000)).toBe('excellent');
      expect(classifyLatency(1499)).toBe('excellent');
    });

    it('should classify 1.5s-2.0s as good', () => {
      expect(classifyLatency(1500)).toBe('good');
      expect(classifyLatency(1750)).toBe('good');
      expect(classifyLatency(1999)).toBe('good');
    });

    it('should classify 2.0s-3.0s as acceptable', () => {
      expect(classifyLatency(2000)).toBe('acceptable');
      expect(classifyLatency(2500)).toBe('acceptable');
      expect(classifyLatency(2999)).toBe('acceptable');
    });

    it('should classify >3.0s as poor', () => {
      expect(classifyLatency(3000)).toBe('poor');
      expect(classifyLatency(4000)).toBe('poor');
      expect(classifyLatency(10000)).toBe('poor');
    });

    it('should classify 0ms as excellent', () => {
      expect(classifyLatency(0)).toBe('excellent');
    });

    it('should classify boundary values correctly', () => {
      // Exact boundaries
      expect(classifyLatency(1500)).toBe('good'); // 1.5s boundary
      expect(classifyLatency(2000)).toBe('acceptable'); // 2.0s boundary
      expect(classifyLatency(3000)).toBe('poor'); // 3.0s boundary
    });
  });

  // ================================================================
  // Integrated Measurement + Classification
  // ================================================================

  describe('Integrated measurement and classification', () => {
    it('should return excellent for fast turn', () => {
      const measurement = measureLatency({
        sttMs: 200,
        moderationMs: 30,
        llmMs: 500,
        ttsMs: 150,
        networkMs: 50,
      });

      expect(measurement.classification).toBe('excellent');
      expect(measurement.totalMs).toBe(930);
    });

    it('should return good for typical turn', () => {
      const measurement = measureLatency({
        sttMs: 300,
        moderationMs: 50,
        llmMs: 800,
        ttsMs: 200,
        networkMs: 200,
      });

      expect(measurement.classification).toBe('good');
      expect(measurement.totalMs).toBe(1550);
    });

    it('should return acceptable for slower turn', () => {
      const measurement = measureLatency({
        sttMs: 500,
        moderationMs: 100,
        llmMs: 1000,
        ttsMs: 300,
        networkMs: 200,
      });

      expect(measurement.classification).toBe('acceptable');
      expect(measurement.totalMs).toBe(2100);
    });

    it('should return poor for slow turn', () => {
      const measurement = measureLatency({
        sttMs: 800,
        moderationMs: 200,
        llmMs: 2000,
        ttsMs: 500,
        networkMs: 500,
      });

      expect(measurement.classification).toBe('poor');
      expect(measurement.totalMs).toBe(4000);
    });
  });

  // ================================================================
  // Telemetry Payload Format
  // ================================================================

  describe('Telemetry payload format', () => {
    it('should produce correct PostHog event format', () => {
      const measurement = measureLatency({
        sttMs: 300,
        moderationMs: 50,
        llmMs: 800,
        ttsMs: 200,
        networkMs: 150,
      });

      const payload = buildTelemetryPayload('session-123', 5, measurement);

      expect(payload.event).toBe('turn_latency');
      expect(payload.properties).toBeDefined();
      expect(payload.properties.session_id).toBe('session-123');
      expect(payload.properties.turn_number).toBe(5);
      expect(payload.properties.total_latency_ms).toBe(1500);
      expect(payload.properties.stt_latency_ms).toBe(300);
      expect(payload.properties.moderation_latency_ms).toBe(50);
      expect(payload.properties.llm_latency_ms).toBe(800);
      expect(payload.properties.tts_latency_ms).toBe(200);
      expect(payload.properties.network_latency_ms).toBe(150);
      expect(payload.properties.classification).toBe('good');
      expect(payload.properties.timestamp).toBeDefined();
    });

    it('should include ISO timestamp', () => {
      const measurement = measureLatency({
        sttMs: 100,
        moderationMs: 20,
        llmMs: 300,
        ttsMs: 100,
        networkMs: 50,
      });

      const payload = buildTelemetryPayload('session-456', 1, measurement);

      // Verify ISO format
      expect(payload.properties.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it('should have all required fields for PostHog analytics', () => {
      const measurement = measureLatency({
        sttMs: 500,
        moderationMs: 100,
        llmMs: 1000,
        ttsMs: 300,
        networkMs: 200,
      });

      const payload = buildTelemetryPayload('session-789', 10, measurement);
      const props = payload.properties;

      // All required fields must be present
      const requiredFields = [
        'session_id',
        'turn_number',
        'total_latency_ms',
        'stt_latency_ms',
        'moderation_latency_ms',
        'llm_latency_ms',
        'tts_latency_ms',
        'network_latency_ms',
        'classification',
        'timestamp',
      ];

      for (const field of requiredFields) {
        expect(props).toHaveProperty(field);
      }
    });

    it('should have numeric values for latency fields', () => {
      const measurement = measureLatency({
        sttMs: 200,
        moderationMs: 40,
        llmMs: 600,
        ttsMs: 150,
        networkMs: 80,
      });

      const payload = buildTelemetryPayload('session-abc', 3, measurement);
      const props = payload.properties;

      expect(typeof props.total_latency_ms).toBe('number');
      expect(typeof props.stt_latency_ms).toBe('number');
      expect(typeof props.moderation_latency_ms).toBe('number');
      expect(typeof props.llm_latency_ms).toBe('number');
      expect(typeof props.tts_latency_ms).toBe('number');
      expect(typeof props.network_latency_ms).toBe('number');
    });
  });
});
