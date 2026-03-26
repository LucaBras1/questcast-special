import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// ============================================
// Auth Store (with SecureStore persistence)
// ============================================

const TOKENS_KEY = 'questcast_auth_tokens';
const USER_KEY = 'questcast_auth_user';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  language: 'cs' | 'en';
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface AuthState {
  user: AuthUser | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setUser: (user: AuthUser) => void;
  setTokens: (tokens: AuthTokens) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

async function persistAuth(user: AuthUser, tokens: AuthTokens): Promise<void> {
  await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens));
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

async function clearPersistedAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKENS_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  // State
  user: null,
  tokens: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  error: null,

  // Actions
  checkAuth: async () => {
    try {
      const [tokensJson, userJson] = await Promise.all([
        SecureStore.getItemAsync(TOKENS_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);

      if (!tokensJson || !userJson) {
        set({ isInitialized: true });
        return;
      }

      const tokens: AuthTokens = JSON.parse(tokensJson);
      const user: AuthUser = JSON.parse(userJson);

      // Check if token is expired (with 60s buffer)
      const now = Date.now();
      if (tokens.expiresAt < now + 60_000) {
        // Try to refresh
        if (tokens.refreshToken) {
          try {
            const { apiClient } = await import('../services/api');
            const newTokens = await apiClient.auth.refresh(tokens.refreshToken);
            await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(newTokens));
            set({
              user,
              tokens: newTokens,
              isAuthenticated: true,
              isInitialized: true,
            });
            return;
          } catch {
            // Refresh failed, clear auth
            await clearPersistedAuth();
            set({ isInitialized: true });
            return;
          }
        }
        await clearPersistedAuth();
        set({ isInitialized: true });
        return;
      }

      set({
        user,
        tokens,
        isAuthenticated: true,
        isInitialized: true,
      });
    } catch {
      set({ isInitialized: true });
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { apiClient } = await import('../services/api');
      const response = await apiClient.auth.login(email, password);
      await persistAuth(response.user, response.tokens);
      set({
        user: response.user,
        tokens: response.tokens,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  register: async (email: string, password: string, displayName: string) => {
    set({ isLoading: true, error: null });
    try {
      const { apiClient } = await import('../services/api');
      const response = await apiClient.auth.register(email, password, displayName);
      await persistAuth(response.user, response.tokens);
      set({
        user: response.user,
        tokens: response.tokens,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    await clearPersistedAuth();
    set({
      user: null,
      tokens: null,
      isAuthenticated: false,
      error: null,
    });
  },

  refreshToken: async () => {
    const { tokens } = get();
    if (!tokens?.refreshToken) return;

    try {
      const { apiClient } = await import('../services/api');
      const newTokens = await apiClient.auth.refresh(tokens.refreshToken);
      await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(newTokens));
      set({ tokens: newTokens });
    } catch {
      // If refresh fails, log out
      await get().logout();
    }
  },

  setUser: (user) => set({ user }),
  setTokens: (tokens) => set({ tokens, isAuthenticated: true }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearError: () => set({ error: null }),
}));
