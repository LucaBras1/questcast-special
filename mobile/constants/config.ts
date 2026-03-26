// ============================================
// QUESTCAST - App Configuration
// ============================================

export const Config = {
  API_BASE_URL: process.env.EXPO_PUBLIC_API_URL ?? 'https://api-staging.questcast.app',
  APP_VERSION: '0.1.0',
  CONTENT_RATING: 'Teen' as const,

  // Audio settings
  AUDIO_SAMPLE_RATE: 16000,
  AUDIO_CHANNELS: 1,
  AUDIO_BIT_RATE: 128000,

  // Game settings
  AUTO_SAVE_INTERVAL_TURNS: 5,
  MAX_SESSION_MINUTES: 60,
  SOFT_SESSION_LIMIT_MINUTES: 45,

  // UI settings
  TRANSCRIPT_MAX_MESSAGES: 100,
  ANIMATION_DURATION_MS: 300,
  DEBOUNCE_MS: 300,
} as const;
