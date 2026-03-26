import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// Game Store (with transcript persistence)
// ============================================

const TRANSCRIPT_STORAGE_PREFIX = 'questcast_transcript_';
const MAX_PERSISTED_MESSAGES = 50;

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

export interface TranscriptMessage {
  id: string;
  role: 'narrator' | 'player' | 'system';
  text: string;
  audioUrl?: string;
  timestamp: number;
}

export interface GameSessionSummary {
  id: string;
  characterName: string;
  characterClass: CharacterClass;
  lastPlayed: string;
  turnsPlayed: number;
  currentLocation: string;
  status: 'active' | 'paused' | 'completed';
}

export interface ActiveGameState {
  sessionId: string;
  character: Character;
  currentLocation: string;
  activeQuest: string;
  questProgress: number;
  turnsPlayed: number;
  timeElapsedMinutes: number;
  lastSavedAt: string;
}

interface GameState {
  // Session list
  sessions: GameSessionSummary[];
  sessionsLoading: boolean;

  // Active game
  currentSession: ActiveGameState | null;
  transcript: TranscriptMessage[];
  isRecording: boolean;
  isProcessing: boolean;
  isPlayingAudio: boolean;

  // Auto-save tracking
  turnsSinceLastSave: number;
  lastSaveStatus: 'idle' | 'saving' | 'saved' | 'error';

  // Error
  error: string | null;
}

interface GameActions {
  // Session management
  setSessions: (sessions: GameSessionSummary[]) => void;
  setSessionsLoading: (loading: boolean) => void;

  // Game lifecycle
  startSession: (session: ActiveGameState) => void;
  endSession: () => void;
  updateGameState: (update: Partial<ActiveGameState>) => void;

  // Transcript
  addMessage: (message: TranscriptMessage) => void;
  updateMessage: (id: string, update: Partial<TranscriptMessage>) => void;
  clearTranscript: () => void;

  // Transcript persistence
  persistTranscript: () => Promise<void>;
  loadPersistedTranscript: (sessionId: string) => Promise<TranscriptMessage[]>;

  // Recording state
  setRecording: (recording: boolean) => void;
  setProcessing: (processing: boolean) => void;
  setPlayingAudio: (playing: boolean) => void;

  // Auto-save
  incrementTurnCount: () => void;
  setLastSaveStatus: (status: GameState['lastSaveStatus']) => void;
  resetTurnsSinceLastSave: () => void;

  // Error
  setError: (error: string | null) => void;
}

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  // State
  sessions: [],
  sessionsLoading: false,
  currentSession: null,
  transcript: [],
  isRecording: false,
  isProcessing: false,
  isPlayingAudio: false,
  turnsSinceLastSave: 0,
  lastSaveStatus: 'idle',
  error: null,

  // Actions
  setSessions: (sessions) => set({ sessions }),
  setSessionsLoading: (sessionsLoading) => set({ sessionsLoading }),

  startSession: (session) =>
    set({
      currentSession: session,
      transcript: [],
      isRecording: false,
      isProcessing: false,
      error: null,
      turnsSinceLastSave: 0,
      lastSaveStatus: 'idle',
    }),

  endSession: () => {
    // Persist transcript before clearing
    const { currentSession, transcript } = get();
    if (currentSession && transcript.length > 0) {
      const key = `${TRANSCRIPT_STORAGE_PREFIX}${currentSession.sessionId}`;
      const toStore = transcript.slice(-MAX_PERSISTED_MESSAGES);
      AsyncStorage.setItem(key, JSON.stringify(toStore)).catch(() => {});
    }

    set({
      currentSession: null,
      transcript: [],
      isRecording: false,
      isProcessing: false,
      turnsSinceLastSave: 0,
      lastSaveStatus: 'idle',
    });
  },

  updateGameState: (update) =>
    set((state) => ({
      currentSession: state.currentSession
        ? { ...state.currentSession, ...update }
        : null,
    })),

  addMessage: (message) =>
    set((state) => ({
      transcript: [...state.transcript, message],
    })),

  updateMessage: (id, update) =>
    set((state) => ({
      transcript: state.transcript.map((msg) =>
        msg.id === id ? { ...msg, ...update } : msg,
      ),
    })),

  clearTranscript: () => set({ transcript: [] }),

  persistTranscript: async () => {
    const { currentSession, transcript } = get();
    if (!currentSession || transcript.length === 0) return;

    try {
      const key = `${TRANSCRIPT_STORAGE_PREFIX}${currentSession.sessionId}`;
      const toStore = transcript.slice(-MAX_PERSISTED_MESSAGES);
      await AsyncStorage.setItem(key, JSON.stringify(toStore));
    } catch {
      // Non-critical: persistence failure should not affect gameplay
    }
  },

  loadPersistedTranscript: async (sessionId: string) => {
    try {
      const key = `${TRANSCRIPT_STORAGE_PREFIX}${sessionId}`;
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const messages = JSON.parse(stored) as TranscriptMessage[];
        return messages;
      }
    } catch {
      // If parsing fails, return empty
    }
    return [];
  },

  setRecording: (isRecording) => set({ isRecording }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  setPlayingAudio: (isPlayingAudio) => set({ isPlayingAudio }),

  incrementTurnCount: () =>
    set((state) => ({ turnsSinceLastSave: state.turnsSinceLastSave + 1 })),

  setLastSaveStatus: (lastSaveStatus) => set({ lastSaveStatus }),
  resetTurnsSinceLastSave: () => set({ turnsSinceLastSave: 0 }),

  setError: (error) => set({ error }),
}));
