import PostHog from 'posthog-react-native';
import Constants from 'expo-constants';

// --- Configuration ---

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

let posthogClient: PostHog | null = null;

/**
 * Initialize the PostHog analytics client.
 * Call once at app startup (root _layout.tsx).
 */
export function initPostHog(): PostHog | null {
  if (!POSTHOG_KEY) {
    console.warn('[PostHog] EXPO_PUBLIC_POSTHOG_KEY not set -- analytics disabled');
    return null;
  }

  if (posthogClient) {
    return posthogClient;
  }

  posthogClient = new PostHog(POSTHOG_KEY, {
    host: POSTHOG_HOST,
    // Disable in development to avoid polluting data
    disabled: __DEV__,
  });

  return posthogClient;
}

/**
 * Get the PostHog client instance.
 * Returns null if not initialized or disabled.
 */
export function getPostHog(): PostHog | null {
  return posthogClient;
}

// --- Event Tracking ---

/**
 * Standard events to track throughout the app.
 */
export const PostHogEvents = {
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',
  TURN_COMPLETED: 'turn_completed',
  VOICE_LATENCY: 'voice_latency',
  ERROR_OCCURRED: 'error_occurred',
  CHARACTER_CREATED: 'character_created',
  DICE_ROLLED: 'dice_rolled',
  GAME_SAVED: 'game_saved',
  GAME_LOADED: 'game_loaded',
  AUTH_LOGIN: 'auth_login',
  AUTH_REGISTER: 'auth_register',
  AUTH_LOGOUT: 'auth_logout',
} as const;

/**
 * Track a custom event with optional properties.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  posthogClient?.capture(event, properties);
}

/**
 * Identify a user after login/registration.
 */
export function identifyUser(
  userId: string,
  traits?: Record<string, string | number | boolean | null>,
): void {
  posthogClient?.identify(userId, traits);
}

/**
 * Reset user identity on logout.
 */
export function resetUser(): void {
  posthogClient?.reset();
}

// --- Latency Telemetry ---

interface LatencyMeasurement {
  micReleaseTimestamp: number;
  firstAudioPlayTimestamp?: number;
  sessionId: string;
  turnNumber: number;
}

let currentMeasurement: LatencyMeasurement | null = null;

/**
 * Start a latency measurement when the user releases the mic button.
 * Call this immediately when the user stops recording.
 */
export function startLatencyMeasurement(sessionId: string, turnNumber: number): void {
  currentMeasurement = {
    micReleaseTimestamp: Date.now(),
    sessionId,
    turnNumber,
  };
}

/**
 * Complete the latency measurement when the first TTS audio segment starts playing.
 * Automatically sends the latency_ms metric to PostHog.
 */
export function completeLatencyMeasurement(): number | null {
  if (!currentMeasurement) {
    return null;
  }

  const now = Date.now();
  currentMeasurement.firstAudioPlayTimestamp = now;

  const latencyMs = now - currentMeasurement.micReleaseTimestamp;

  trackEvent(PostHogEvents.VOICE_LATENCY, {
    latency_ms: latencyMs,
    session_id: currentMeasurement.sessionId,
    turn_number: currentMeasurement.turnNumber,
    mic_release_timestamp: currentMeasurement.micReleaseTimestamp,
    first_audio_play_timestamp: now,
    // Classify for dashboard filtering
    latency_bucket:
      latencyMs < 2000
        ? 'excellent'
        : latencyMs < 3000
          ? 'good'
          : latencyMs < 5000
            ? 'acceptable'
            : 'poor',
  });

  const result = latencyMs;
  currentMeasurement = null;
  return result;
}

/**
 * Cancel an in-progress latency measurement (e.g., on error or timeout).
 */
export function cancelLatencyMeasurement(reason: string): void {
  if (currentMeasurement) {
    trackEvent(PostHogEvents.ERROR_OCCURRED, {
      error_type: 'latency_measurement_cancelled',
      reason,
      session_id: currentMeasurement.sessionId,
      turn_number: currentMeasurement.turnNumber,
      elapsed_ms: Date.now() - currentMeasurement.micReleaseTimestamp,
    });
    currentMeasurement = null;
  }
}

/**
 * Flush all pending events. Call before app goes to background.
 */
export async function flushEvents(): Promise<void> {
  await posthogClient?.flush();
}

/**
 * Shut down the PostHog client. Call on app unmount.
 */
export async function shutdownPostHog(): Promise<void> {
  await posthogClient?.flush();
  posthogClient = null;
}
