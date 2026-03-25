// ============================================
// QUESTCAST - Shared Constants
// ============================================

// Game limits
export const MAX_TURNS_PER_SESSION = 60;
export const SOFT_SESSION_LIMIT_MINUTES = 45;
export const HARD_SESSION_LIMIT_MINUTES = 60;
export const AUTO_SAVE_EVERY_N_TURNS = 5;
export const SUMMARY_EVERY_N_TURNS = 10;
export const MAX_IMAGES_PER_SESSION = 2;
export const CONVERSATION_HISTORY_WINDOW = 15;

// AI token limits
export const MAX_LLM_OUTPUT_TOKENS = 200;
export const MAX_TTS_CHARACTERS = 200;
export const MAX_SYSTEM_PROMPT_TOKENS = 2000;

// Latency targets (ms)
export const LATENCY_TARGET_P50 = 2000;
export const LATENCY_TARGET_P95 = 3000;
export const LATENCY_HARD_FAIL = 5000;

// Audio
export const AUDIO_SAMPLE_RATE = 16000;
export const AUDIO_FORMAT = 'opus';
export const AUDIO_CONTAINER = 'webm';

// Character classes
export const CHARACTER_CLASSES = ['warrior', 'mage', 'rogue', 'ranger'] as const;

// Supported languages
export const SUPPORTED_LANGUAGES = ['cs', 'en'] as const;

// Content ratings
export const CONTENT_RATINGS = ['family', 'teen', 'mature'] as const;

// API rate limits (requests per minute)
export const RATE_LIMIT_FREE = 10;
export const RATE_LIMIT_AUTHENTICATED = 30;
