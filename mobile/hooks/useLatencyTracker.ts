import { useRef, useCallback } from 'react';

// ============================================
// Latency Tracker Hook
// Tracks mic-release -> first-audio-play -> turn-complete
// ============================================

type LatencyClassification = 'excellent' | 'good' | 'acceptable' | 'poor';

interface LatencyMetrics {
  micReleaseTimestamp: number | null;
  firstAudioPlayTimestamp: number | null;
  turnCompleteTimestamp: number | null;
  latencyMicToAudioMs: number | null;
  latencyTotalMs: number | null;
  classification: LatencyClassification | null;
}

interface UseLatencyTrackerReturn {
  /** Call when user releases the mic button (stops recording) */
  markMicRelease: () => void;
  /** Call when the first TTS audio byte begins playing */
  markFirstAudioPlay: () => void;
  /** Call when the full turn cycle is complete */
  markTurnComplete: () => void;
  /** Get current latency metrics */
  getMetrics: () => LatencyMetrics;
  /** Reset tracker for a new turn */
  reset: () => void;
}

function classifyLatency(ms: number): LatencyClassification {
  if (ms < 1500) return 'excellent';
  if (ms < 2000) return 'good';
  if (ms < 3000) return 'acceptable';
  return 'poor';
}

export function useLatencyTracker(): UseLatencyTrackerReturn {
  const micReleaseRef = useRef<number | null>(null);
  const firstAudioPlayRef = useRef<number | null>(null);
  const turnCompleteRef = useRef<number | null>(null);
  const reportedRef = useRef(false);

  const markMicRelease = useCallback(() => {
    micReleaseRef.current = performance.now();
    firstAudioPlayRef.current = null;
    turnCompleteRef.current = null;
    reportedRef.current = false;
  }, []);

  const reportToPostHog = useCallback((metrics: LatencyMetrics, turnId?: string) => {
    if (reportedRef.current) return;
    reportedRef.current = true;

    try {
      // PostHog capture -- use the global posthog instance if available
      // This is a best-effort telemetry call
      const posthog = (globalThis as Record<string, unknown>).posthog as
        | { capture: (event: string, properties: Record<string, unknown>) => void }
        | undefined;

      if (posthog?.capture) {
        posthog.capture('turn_latency', {
          latency_mic_to_audio_ms: metrics.latencyMicToAudioMs,
          latency_total_ms: metrics.latencyTotalMs,
          classification: metrics.classification,
          turn_id: turnId,
        });
      }
    } catch {
      // Telemetry should never break the app
    }
  }, []);

  const markFirstAudioPlay = useCallback(() => {
    if (firstAudioPlayRef.current !== null) return; // Only mark once per turn
    firstAudioPlayRef.current = performance.now();
  }, []);

  const markTurnComplete = useCallback(() => {
    turnCompleteRef.current = performance.now();

    const metrics = buildMetrics();
    if (metrics.latencyMicToAudioMs !== null) {
      reportToPostHog(metrics);
    }
  }, [reportToPostHog]);

  const buildMetrics = (): LatencyMetrics => {
    const micToAudio =
      micReleaseRef.current !== null && firstAudioPlayRef.current !== null
        ? Math.round(firstAudioPlayRef.current - micReleaseRef.current)
        : null;

    const total =
      micReleaseRef.current !== null && turnCompleteRef.current !== null
        ? Math.round(turnCompleteRef.current - micReleaseRef.current)
        : null;

    return {
      micReleaseTimestamp: micReleaseRef.current,
      firstAudioPlayTimestamp: firstAudioPlayRef.current,
      turnCompleteTimestamp: turnCompleteRef.current,
      latencyMicToAudioMs: micToAudio,
      latencyTotalMs: total,
      classification: micToAudio !== null ? classifyLatency(micToAudio) : null,
    };
  };

  const getMetrics = useCallback((): LatencyMetrics => {
    return buildMetrics();
  }, []);

  const reset = useCallback(() => {
    micReleaseRef.current = null;
    firstAudioPlayRef.current = null;
    turnCompleteRef.current = null;
    reportedRef.current = false;
  }, []);

  return {
    markMicRelease,
    markFirstAudioPlay,
    markTurnComplete,
    getMetrics,
    reset,
  };
}
