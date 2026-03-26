import { useCallback, useRef, useState } from 'react';
import { useSSE, SSEEvent } from './useSSE';
import { useAudioRecorder } from './useAudioRecorder';
import { useAudioPlayer } from './useAudioPlayer';
import { useLatencyTracker } from './useLatencyTracker';
import { useGameStore, TranscriptMessage } from '../stores/gameStore';
import type { SSETurnEventType } from '../../shared/types';

// ============================================
// Game Turn Hook
// Orchestrates the full turn cycle:
// record -> stop -> base64 -> SSE -> process events -> play audio
// ============================================

interface UseGameTurnReturn {
  /** Start the mic recording */
  startRecording: () => Promise<void>;
  /** Stop recording and submit the turn via SSE */
  stopRecordingAndSubmit: () => Promise<void>;
  /** Submit a text input turn (fallback mode) */
  submitTextTurn: (text: string) => Promise<void>;
  /** Cancel an in-progress recording without submitting */
  cancelRecording: () => Promise<void>;
  /** Whether the mic is currently recording */
  isRecording: boolean;
  /** Whether a turn is being processed (SSE stream active) */
  isProcessing: boolean;
  /** The player's transcribed text for the current turn */
  currentTranscription: string | null;
  /** The AI narration text being streamed */
  currentNarration: string;
  /** Whether audio is playing */
  isPlayingAudio: boolean;
  /** Error from the last turn */
  error: string | null;
  /** Retry the last failed turn */
  retryLastTurn: () => void;
  /** SSE connection state */
  sseConnected: boolean;
  sseReconnecting: boolean;
  /** Stop audio playback */
  stopAudio: () => Promise<void>;
  /** Latency classification for the last turn */
  latencyClass: string | null;
}

export function useGameTurn(sessionId: string): UseGameTurnReturn {
  const {
    addMessage,
    setProcessing: setStoreProcessing,
    setRecording: setStoreRecording,
    updateGameState,
  } = useGameStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTranscription, setCurrentTranscription] = useState<string | null>(null);
  const [currentNarration, setCurrentNarration] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [latencyClass, setLatencyClass] = useState<string | null>(null);

  const currentTurnIdRef = useRef<string | null>(null);
  const narrationRef = useRef('');
  const playerMessageIdRef = useRef<string | null>(null);
  const narratorMessageIdRef = useRef<string | null>(null);
  const lastAudioPayloadRef = useRef<{ audioBase64?: string; textInput?: string } | null>(null);

  const recorder = useAudioRecorder();
  const latency = useLatencyTracker();

  const player = useAudioPlayer({
    onFirstAudioPlay: () => {
      latency.markFirstAudioPlay();
    },
    onQueueComplete: () => {
      latency.markTurnComplete();
      const metrics = latency.getMetrics();
      if (metrics.classification) {
        setLatencyClass(metrics.classification);
      }
    },
  });

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    const eventType = event.event as SSETurnEventType;

    let parsedData: Record<string, unknown> = {};
    try {
      if (event.data) {
        parsedData = JSON.parse(event.data);
      }
    } catch {
      parsedData = { raw: event.data };
    }

    switch (eventType) {
      case 'turn_start': {
        currentTurnIdRef.current = (parsedData.turnId as string) ?? event.id;
        narrationRef.current = '';
        setCurrentNarration('');
        setIsProcessing(true);
        setStoreProcessing(true);
        setError(null);
        break;
      }

      case 'transcription': {
        const text = (parsedData.text as string) ?? '';
        setCurrentTranscription(text);

        // Update the player's placeholder message with actual transcription
        if (playerMessageIdRef.current) {
          const { transcript } = useGameStore.getState();
          const updated = transcript.map((msg) =>
            msg.id === playerMessageIdRef.current
              ? { ...msg, text }
              : msg,
          );
          // We need to replace transcript - use store action pattern
          useGameStore.setState({ transcript: updated });
        }
        break;
      }

      case 'narration_chunk': {
        const chunk = (parsedData.text as string) ?? '';
        narrationRef.current += chunk;
        setCurrentNarration(narrationRef.current);

        // Update or create narrator message
        const { transcript } = useGameStore.getState();
        if (narratorMessageIdRef.current) {
          const updated = transcript.map((msg) =>
            msg.id === narratorMessageIdRef.current
              ? { ...msg, text: narrationRef.current }
              : msg,
          );
          useGameStore.setState({ transcript: updated });
        } else {
          const msgId = `msg-narrator-${currentTurnIdRef.current ?? Date.now()}`;
          narratorMessageIdRef.current = msgId;
          addMessage({
            id: msgId,
            role: 'narrator',
            text: narrationRef.current,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'tts_chunk': {
        const audioUrl = (parsedData.audioUrl as string) ?? (parsedData.url as string) ?? '';
        if (audioUrl) {
          player.queueAudio(audioUrl);
        }
        break;
      }

      case 'narration_complete': {
        // Final narration text - ensure message is complete
        const finalText = (parsedData.text as string) ?? narrationRef.current;
        if (narratorMessageIdRef.current) {
          const { transcript } = useGameStore.getState();
          const updated = transcript.map((msg) =>
            msg.id === narratorMessageIdRef.current
              ? { ...msg, text: finalText }
              : msg,
          );
          useGameStore.setState({ transcript: updated });
        }
        break;
      }

      case 'tts_complete': {
        // All audio URLs have been sent; queue is complete
        break;
      }

      case 'state_update': {
        const stateData = parsedData as Record<string, unknown>;
        updateGameState(stateData);
        break;
      }

      case 'turn_end': {
        setIsProcessing(false);
        setStoreProcessing(false);
        playerMessageIdRef.current = null;
        narratorMessageIdRef.current = null;
        break;
      }

      case 'error': {
        const errorMsg = (parsedData.message as string) ?? 'An error occurred during the turn';
        setError(errorMsg);
        setIsProcessing(false);
        setStoreProcessing(false);

        addMessage({
          id: `msg-error-${Date.now()}`,
          role: 'system',
          text: errorMsg,
          timestamp: Date.now(),
        });
        break;
      }

      case 'moderation_pass': {
        // Moderation passed, no UI action needed
        break;
      }

      default:
        break;
    }
  }, [addMessage, setStoreProcessing, updateGameState, player]);

  const sse = useSSE({
    onEvent: handleSSEEvent,
    onError: (err) => {
      setError(err.message);
      setIsProcessing(false);
      setStoreProcessing(false);
    },
    onClose: () => {
      // SSE stream ended - this is normal after turn_end
    },
    maxReconnectAttempts: 0, // No reconnect for turn SSE (each turn is a new connection)
  });

  const submitPayload = useCallback((payload: { audioBase64?: string; textInput?: string }) => {
    lastAudioPayloadRef.current = payload;
    setError(null);
    narrationRef.current = '';
    setCurrentNarration('');
    setCurrentTranscription(null);

    // Add player placeholder message
    const msgId = `msg-player-${Date.now()}`;
    playerMessageIdRef.current = msgId;
    narratorMessageIdRef.current = null;

    addMessage({
      id: msgId,
      role: 'player',
      text: payload.textInput ?? '(Speaking...)',
      timestamp: Date.now(),
    });

    setIsProcessing(true);
    setStoreProcessing(true);

    // Open SSE connection with the turn payload
    sse.connect(`/api/game/session/${sessionId}/turn`, payload);
  }, [sessionId, addMessage, setStoreProcessing, sse]);

  const startRecording = useCallback(async () => {
    setError(null);
    await recorder.startRecording();
    setStoreRecording(true);
  }, [recorder, setStoreRecording]);

  const stopRecordingAndSubmit = useCallback(async () => {
    setStoreRecording(false);
    latency.markMicRelease();

    const uri = await recorder.stopRecording();
    if (!uri) {
      setError('Recording failed - no audio captured');
      return;
    }

    try {
      // Read audio file as base64
      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = (reader.result as string).split(',')[1];
          resolve(result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      submitPayload({ audioBase64: base64 });
    } catch (err) {
      setError('Failed to process audio recording');
      console.error('Audio base64 conversion failed:', err);
    }
  }, [recorder, latency, submitPayload, setStoreRecording]);

  const submitTextTurn = useCallback(async (text: string) => {
    if (!text.trim()) return;
    latency.markMicRelease(); // Still track total latency for text turns
    submitPayload({ textInput: text.trim() });
  }, [latency, submitPayload]);

  const cancelRecording = useCallback(async () => {
    setStoreRecording(false);
    await recorder.cancelRecording();
  }, [recorder, setStoreRecording]);

  const retryLastTurn = useCallback(() => {
    if (lastAudioPayloadRef.current) {
      latency.markMicRelease();
      submitPayload(lastAudioPayloadRef.current);
    }
  }, [latency, submitPayload]);

  return {
    startRecording,
    stopRecordingAndSubmit,
    submitTextTurn,
    cancelRecording,
    isRecording: recorder.isRecording,
    isProcessing,
    currentTranscription,
    currentNarration,
    isPlayingAudio: player.isPlaying,
    error,
    retryLastTurn,
    sseConnected: sse.isConnected,
    sseReconnecting: sse.isReconnecting,
    stopAudio: player.stopAudio,
    latencyClass,
  };
}
