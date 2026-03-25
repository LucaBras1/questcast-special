// ============================================
// QUESTCAST - Shared Types
// ============================================

// ---- User & Auth ----
export interface User {
  id: string;
  email: string;
  displayName: string;
  language: 'cs' | 'en';
  contentRating: 'family' | 'teen' | 'mature';
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// ---- Character ----
export type CharacterClass = 'warrior' | 'mage' | 'rogue' | 'ranger';

export interface Character {
  id: string;
  name: string;
  class: CharacterClass;
  level: number;
  health: number;
  maxHealth: number;
  inventory: string[];
  gold: number;
  abilities: string[];
}

// ---- Game State ----
export interface GameState {
  sessionId: string;
  character: Character;
  story: {
    currentChapter: number;
    currentLocation: string;
    activeQuest: string;
    questProgress: number;
    npcsMet: string[];
    keyDecisions: string[];
    narrativeSummary: string; // 10-turn rolling summary
  };
  world: {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    weather: string;
    threatLevel: 'low' | 'moderate' | 'high' | 'critical';
  };
  session: {
    turnsPlayed: number;
    imagesGenerated: number;
    timeElapsedMinutes: number;
    lastSavedAt: string;
  };
}

// ---- Game Session ----
export interface GameSession {
  id: string;
  userId: string;
  characterId: string;
  status: 'active' | 'paused' | 'completed';
  gameState: GameState;
  createdAt: string;
  updatedAt: string;
}

// ---- API Types ----

// SSE Event types for game turn streaming
export type SSETurnEventType =
  | 'turn_start'
  | 'transcription'
  | 'moderation_pass'
  | 'narration_chunk'
  | 'narration_complete'
  | 'tts_chunk'
  | 'tts_complete'
  | 'state_update'
  | 'turn_end'
  | 'error';

export interface SSETurnEvent {
  id: string;
  type: SSETurnEventType;
  data: unknown;
  timestamp: number;
}

// Turn request/response
export interface TurnRequest {
  audioBase64?: string; // Voice input
  textInput?: string;   // Text fallback
}

export interface TurnResponse {
  turnId: string;
  narrationText: string;
  audioUrl?: string;
  stateUpdate: Partial<GameState>;
  imageUrl?: string;
}

// Dice
export interface DiceRollRequest {
  diceType: 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20';
  actionType: string;
  modifiers?: number;
}

export interface DiceRollResult {
  rollValue: number;
  diceType: string;
  modifiers: number;
  total: number;
  difficultyClass: number;
  success: boolean;
  narration: string;
  audioUrl?: string;
}

// Image generation
export interface ImageRequest {
  sceneDescription: string;
  artStyle: 'epic_fantasy' | 'dark_atmospheric' | 'storybook' | 'painterly';
}

export interface ImageResponse {
  imageUrl: string;
  prompt: string;
  cached: boolean;
}

// Error response
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ---- AI Service Types ----
export interface AICost {
  sttCost: number;
  llmInputCost: number;
  llmOutputCost: number;
  ttsCost: number;
  imageCost: number;
  totalCost: number;
}
