import { Config } from '../constants/config';
import { useAuthStore } from '../stores/authStore';

// ============================================
// API Client Service (with 401 auto-refresh)
// ============================================

interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(status: number, response: ApiErrorResponse) {
    super(response.message);
    this.name = 'ApiError';
    this.code = response.code;
    this.status = status;
    this.details = response.details;
  }
}

let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { noAuth?: boolean },
): Promise<T> {
  const url = `${Config.API_BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Inject auth token if available
  if (!options?.noAuth) {
    const tokens = useAuthStore.getState().tokens;
    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  // Handle 401 with auto-refresh (only for authenticated requests)
  if (response.status === 401 && !options?.noAuth) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry with new token
      const newTokens = useAuthStore.getState().tokens;
      if (newTokens?.accessToken) {
        headers['Authorization'] = `Bearer ${newTokens.accessToken}`;
      }
      const retryResponse = await fetch(url, { ...fetchOptions, headers });
      if (!retryResponse.ok) {
        throw await parseErrorResponse(retryResponse);
      }
      if (retryResponse.status === 204) return undefined as T;
      return retryResponse.json();
    }
    // Refresh failed, force logout
    await useAuthStore.getState().logout();
    throw new ApiError(401, { code: 'SESSION_EXPIRED', message: 'Session expired. Please log in again.' });
  }

  if (!response.ok) {
    throw await parseErrorResponse(response);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  let errorBody: ApiErrorResponse;
  try {
    errorBody = await response.json();
  } catch {
    errorBody = {
      code: 'UNKNOWN_ERROR',
      message: `Request failed with status ${response.status}`,
    };
  }
  return new ApiError(response.status, errorBody);
}

async function tryRefreshToken(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (isRefreshing && refreshPromise) {
    try {
      await refreshPromise;
      return useAuthStore.getState().tokens !== null;
    } catch {
      return false;
    }
  }

  const tokens = useAuthStore.getState().tokens;
  if (!tokens?.refreshToken) return false;

  isRefreshing = true;
  refreshPromise = useAuthStore.getState().refreshToken();

  try {
    await refreshPromise;
    return useAuthStore.getState().tokens !== null;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
    refreshPromise = null;
  }
}

// ---- Auth endpoints ----

interface AuthResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    language: 'cs' | 'en';
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
}

const auth = {
  register: async (email: string, password: string, displayName: string): Promise<AuthResponse> => {
    return request<AuthResponse>('POST', '/api/auth/register', {
      email,
      password,
      displayName,
    }, { noAuth: true });
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    return request<AuthResponse>('POST', '/api/auth/login', {
      email,
      password,
    }, { noAuth: true });
  },

  refresh: async (refreshToken: string) => {
    return request<{ accessToken: string; refreshToken: string; expiresAt: number }>(
      'POST',
      '/api/auth/refresh',
      { refreshToken },
      { noAuth: true },
    );
  },

  updateProfile: async (data: { displayName?: string; language?: 'cs' | 'en' }): Promise<AuthResponse['user']> => {
    return request<AuthResponse['user']>('PATCH', '/api/auth/profile', data);
  },
};

// ---- Game endpoints ----

interface CreateSessionRequest {
  characterName: string;
  characterClass: string;
  language?: 'cs' | 'en';
}

interface CreateSessionResponse {
  sessionId: string;
  character: {
    id: string;
    name: string;
    class: string;
    level: number;
    health: number;
    maxHealth: number;
    inventory: string[];
    gold: number;
    abilities: string[];
  };
  openingNarration: string;
  audioUrl?: string;
}

interface SessionListItem {
  id: string;
  characterName: string;
  characterClass: string;
  lastPlayed: string;
  turnsPlayed: number;
  currentLocation: string;
  status: 'active' | 'paused' | 'completed';
}

interface SessionDetail {
  id: string;
  character: {
    id: string;
    name: string;
    class: string;
    level: number;
    health: number;
    maxHealth: number;
    inventory: string[];
    gold: number;
    abilities: string[];
  };
  gameState: {
    currentLocation: string;
    activeQuest: string;
    questProgress: number;
    turnsPlayed: number;
    timeElapsedMinutes: number;
    lastSavedAt: string;
  };
  recentTranscript: Array<{
    role: 'narrator' | 'player' | 'system';
    text: string;
    timestamp: number;
  }>;
}

interface TurnResponse {
  turnId: string;
  narrationText: string;
  audioUrl?: string;
  stateUpdate: Record<string, unknown>;
}

interface DiceRollResponse {
  rollValue: number;
  diceType: string;
  total: number;
  success: boolean;
  narration: string;
  audioUrl?: string;
}

const game = {
  createSession: async (data: CreateSessionRequest): Promise<CreateSessionResponse> => {
    return request<CreateSessionResponse>('POST', '/api/game/session', data);
  },

  getSession: async (sessionId: string): Promise<SessionDetail> => {
    return request<SessionDetail>('GET', `/api/game/session/${sessionId}`);
  },

  listSessions: async (): Promise<SessionListItem[]> => {
    return request<SessionListItem[]>('GET', '/api/game/sessions');
  },

  submitTurn: async (
    sessionId: string,
    data: { audioBase64?: string; textInput?: string },
  ): Promise<TurnResponse> => {
    return request<TurnResponse>('POST', `/api/game/session/${sessionId}/turn`, data);
  },

  saveSession: async (sessionId: string): Promise<void> => {
    return request<void>('POST', `/api/game/session/${sessionId}/save`);
  },

  rollDice: async (
    sessionId: string,
    data: { diceType: string; actionType: string; modifiers?: number },
  ): Promise<DiceRollResponse> => {
    return request<DiceRollResponse>('POST', `/api/game/session/${sessionId}/dice`, data);
  },
};

// ---- Export ----

export const apiClient = {
  auth,
  game,
};

export { ApiError };
export type {
  AuthResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  SessionListItem,
  SessionDetail,
  TurnResponse,
  DiceRollResponse,
};
