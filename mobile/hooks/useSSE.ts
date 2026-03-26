import { useRef, useState, useCallback, useEffect } from 'react';
import { Config } from '../constants/config';
import { useAuthStore } from '../stores/authStore';

// ============================================
// SSE Client Hook
// Server-Sent Events via fetch + ReadableStream
// ============================================

export interface SSEEvent {
  id: string;
  event: string;
  data: string;
}

interface UseSSEOptions {
  /** Called for each parsed SSE event */
  onEvent: (event: SSEEvent) => void;
  /** Called when connection is established */
  onOpen?: () => void;
  /** Called on connection error */
  onError?: (error: Error) => void;
  /** Called when connection is closed */
  onClose?: () => void;
  /** Max reconnection attempts before giving up */
  maxReconnectAttempts?: number;
}

interface UseSSEReturn {
  /** Open an SSE connection via POST with a JSON body */
  connect: (path: string, body?: unknown) => void;
  /** Close the connection */
  disconnect: () => void;
  /** Whether currently connected and receiving events */
  isConnected: boolean;
  /** Whether currently attempting to reconnect */
  isReconnecting: boolean;
  /** Last received event ID (for reconnection) */
  lastEventId: string | null;
  /** Connection error, if any */
  error: Error | null;
}

export function useSSE(options: UseSSEOptions): UseSSEReturn {
  const { onEvent, onOpen, onError, onClose, maxReconnectAttempts = 5 } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pathRef = useRef<string>('');
  const bodyRef = useRef<unknown>(null);
  const mountedRef = useRef(true);

  // Store callbacks in refs to avoid stale closures
  const onEventRef = useRef(onEvent);
  const onOpenRef = useRef(onOpen);
  const onErrorRef = useRef(onError);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onEventRef.current = onEvent;
    onOpenRef.current = onOpen;
    onErrorRef.current = onError;
    onCloseRef.current = onClose;
  }, [onEvent, onOpen, onError, onClose]);

  const parseSSEChunk = useCallback((chunk: string): SSEEvent[] => {
    const events: SSEEvent[] = [];
    const blocks = chunk.split('\n\n');

    for (const block of blocks) {
      if (!block.trim()) continue;

      let id = '';
      let event = 'message';
      let data = '';

      const lines = block.split('\n');
      for (const line of lines) {
        if (line.startsWith('id:')) {
          id = line.slice(3).trim();
        } else if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          data += (data ? '\n' : '') + line.slice(5).trim();
        }
      }

      if (data || event !== 'message') {
        events.push({ id, event, data });
      }
    }

    return events;
  }, []);

  const startConnection = useCallback(async (path: string, body: unknown, isReconnect = false) => {
    // Abort any existing connection
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const url = `${Config.API_BASE_URL}${path}`;
    const tokens = useAuthStore.getState().tokens;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    };

    if (tokens?.accessToken) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }

    if (lastEventIdRef.current && isReconnect) {
      headers['Last-Event-ID'] = lastEventIdRef.current;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = `SSE connection failed: ${response.status}`;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody.message || errorMessage;
        } catch {
          // Use default error message
        }
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('Response body is not readable');
      }

      if (!mountedRef.current) return;

      setIsConnected(true);
      setIsReconnecting(false);
      setError(null);
      reconnectAttemptsRef.current = 0;
      onOpenRef.current?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done || controller.signal.aborted) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE blocks (separated by double newline)
        const lastDoubleNewline = buffer.lastIndexOf('\n\n');
        if (lastDoubleNewline !== -1) {
          const complete = buffer.substring(0, lastDoubleNewline + 2);
          buffer = buffer.substring(lastDoubleNewline + 2);

          const events = parseSSEChunk(complete);
          for (const event of events) {
            if (event.id) {
              lastEventIdRef.current = event.id;
            }
            if (mountedRef.current) {
              onEventRef.current(event);
            }
          }
        }
      }

      // Connection ended normally
      if (mountedRef.current) {
        setIsConnected(false);
        onCloseRef.current?.();
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Intentional abort, do nothing
        if (mountedRef.current) {
          setIsConnected(false);
        }
        return;
      }

      const connectionError = err instanceof Error ? err : new Error('SSE connection error');

      if (mountedRef.current) {
        setIsConnected(false);
        setError(connectionError);
        onErrorRef.current?.(connectionError);

        // Attempt reconnect with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts && !controller.signal.aborted) {
          const delay = Math.min(
            1000 * Math.pow(2, reconnectAttemptsRef.current),
            10000,
          );
          reconnectAttemptsRef.current += 1;
          setIsReconnecting(true);

          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              startConnection(pathRef.current, bodyRef.current, true);
            }
          }, delay);
        }
      }
    }
  }, [maxReconnectAttempts, parseSSEChunk]);

  const connect = useCallback((path: string, body?: unknown) => {
    pathRef.current = path;
    bodyRef.current = body;
    reconnectAttemptsRef.current = 0;
    lastEventIdRef.current = null;
    setError(null);
    startConnection(path, body);
  }, [startConnection]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsConnected(false);
    setIsReconnecting(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    isConnected,
    isReconnecting,
    lastEventId: lastEventIdRef.current,
    error,
  };
}
