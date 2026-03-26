import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const SENTRY_DSN = Constants.expoConfig?.extra?.sentryDsn
  ?? process.env.EXPO_PUBLIC_SENTRY_DSN
  ?? '';

/**
 * Initialize Sentry for the React Native / Expo app.
 * Call this in the root _layout.tsx before rendering.
 */
export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.warn('[Sentry] EXPO_PUBLIC_SENTRY_DSN not set -- error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    release: Constants.expoConfig?.version
      ? `questcast-mobile@${Constants.expoConfig.version}`
      : 'questcast-mobile@0.1.0',

    // Performance monitoring
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,

    // Only send errors in production builds
    enabled: !__DEV__,

    // Enable automatic session tracking
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30_000,

    integrations: [
      Sentry.reactNativeTracingIntegration({
        routingInstrumentation: Sentry.reactNavigationIntegration(),
      }),
    ],
  });
}

/**
 * Wrap the root component with Sentry error boundary.
 * Usage: export default Sentry.wrap(RootLayout);
 */
export const wrapWithSentry = Sentry.wrap;

/**
 * Get the Sentry navigation integration ref for Expo Router.
 * Pass this to your NavigationContainer or use with useNavigationContainerRef.
 */
export const navigationIntegration = Sentry.reactNavigationIntegration();

/**
 * Capture a handled exception and send to Sentry with context.
 */
export function captureError(
  error: Error,
  context?: Record<string, unknown>,
): void {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }
    Sentry.captureException(error);
  });
}

/**
 * Set the current user for Sentry event attribution.
 */
export function setUser(userId: string, email?: string): void {
  Sentry.setUser({ id: userId, email });
}

/**
 * Clear the current user (on logout).
 */
export function clearUser(): void {
  Sentry.setUser(null);
}

/**
 * Add a breadcrumb for debugging context.
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: 'info',
  });
}
