import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';

// ============================================
// Audio Player Hook (TTS Playback with Streaming Queue)
// Supports queuing multiple audio URLs for gapless playback,
// pre-loading next audio, interruption, and latency callbacks.
// ============================================

interface UseAudioPlayerOptions {
  /** Called when the very first audio in a queue starts playing */
  onFirstAudioPlay?: () => void;
  /** Called when the entire queue finishes playing */
  onQueueComplete?: () => void;
}

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  progress: number;
  duration: number;
  /** Play a single audio URL immediately (stops any current playback) */
  playAudio: (url: string) => Promise<void>;
  /** Stop all playback and clear queue */
  stopAudio: () => Promise<void>;
  /** Pause current playback */
  pauseAudio: () => Promise<void>;
  /** Add a URL to the playback queue; starts playing if idle */
  queueAudio: (url: string) => void;
  /** Clear the queue without stopping current playback */
  clearQueue: () => void;
  /** Number of items remaining in the queue (excluding current) */
  queueLength: number;
}

export function useAudioPlayer(options: UseAudioPlayerOptions = {}): UseAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queueLength, setQueueLength] = useState(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const preloadedSoundRef = useRef<Audio.Sound | null>(null);
  const preloadedUrlRef = useRef<string | null>(null);
  const queueRef = useRef<string[]>([]);
  const isPlayingQueueRef = useRef(false);
  const isFirstInQueueRef = useRef(true);
  const mountedRef = useRef(true);

  const onFirstAudioPlayRef = useRef(options.onFirstAudioPlay);
  const onQueueCompleteRef = useRef(options.onQueueComplete);

  useEffect(() => {
    onFirstAudioPlayRef.current = options.onFirstAudioPlay;
    onQueueCompleteRef.current = options.onQueueComplete;
  }, [options.onFirstAudioPlay, options.onQueueComplete]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
      if (preloadedSoundRef.current) {
        preloadedSoundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const updateQueueLength = useCallback(() => {
    if (mountedRef.current) {
      setQueueLength(queueRef.current.length);
    }
  }, []);

  const unloadCurrent = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch {
        // Ignore unload errors
      }
      soundRef.current = null;
    }
  }, []);

  const unloadPreloaded = useCallback(async () => {
    if (preloadedSoundRef.current) {
      try {
        await preloadedSoundRef.current.unloadAsync();
      } catch {
        // Ignore
      }
      preloadedSoundRef.current = null;
      preloadedUrlRef.current = null;
    }
  }, []);

  /** Pre-load the next audio in queue while current is playing */
  const preloadNext = useCallback(async () => {
    if (queueRef.current.length === 0) return;
    const nextUrl = queueRef.current[0];
    if (nextUrl === preloadedUrlRef.current) return; // Already preloaded

    await unloadPreloaded();

    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: nextUrl },
        { shouldPlay: false },
      );
      if (mountedRef.current) {
        preloadedSoundRef.current = sound;
        preloadedUrlRef.current = nextUrl;
      } else {
        sound.unloadAsync().catch(() => {});
      }
    } catch {
      // Preload failure is non-critical; we will load normally when needed
    }
  }, [unloadPreloaded]);

  const processQueue = useCallback(async () => {
    if (queueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      isFirstInQueueRef.current = true;
      updateQueueLength();
      if (mountedRef.current) {
        setIsPlaying(false);
        onQueueCompleteRef.current?.();
      }
      return;
    }

    const nextUrl = queueRef.current.shift()!;
    updateQueueLength();

    try {
      await unloadCurrent();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      let sound: Audio.Sound;

      // Use preloaded sound if it matches the URL
      if (preloadedSoundRef.current && preloadedUrlRef.current === nextUrl) {
        sound = preloadedSoundRef.current;
        preloadedSoundRef.current = null;
        preloadedUrlRef.current = null;
      } else {
        await unloadPreloaded();
        const result = await Audio.Sound.createAsync(
          { uri: nextUrl },
          { shouldPlay: false },
        );
        sound = result.sound;
      }

      if (!mountedRef.current) {
        sound.unloadAsync().catch(() => {});
        return;
      }

      soundRef.current = sound;

      // Set up status callback
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!mountedRef.current) return;
        if (status.isLoaded) {
          setProgress(status.positionMillis ?? 0);
          setDuration(status.durationMillis ?? 0);
          setIsPlaying(status.isPlaying);

          if (status.didJustFinish) {
            setIsPlaying(false);
            processQueue();
          }
        }
      });

      // Start playing
      await sound.playAsync();

      if (mountedRef.current) {
        setIsPlaying(true);

        // Fire first audio play callback
        if (isFirstInQueueRef.current) {
          isFirstInQueueRef.current = false;
          onFirstAudioPlayRef.current?.();
        }

        // Pre-load next item while current plays
        preloadNext();
      }
    } catch (error) {
      console.error('Failed to play audio from queue:', error);
      if (mountedRef.current) {
        setIsPlaying(false);
        // Try next in queue even on error
        processQueue();
      }
    }
  }, [unloadCurrent, unloadPreloaded, preloadNext, updateQueueLength]);

  const playAudio = useCallback(async (url: string) => {
    // Clear queue and play immediately
    queueRef.current = [];
    isPlayingQueueRef.current = true;
    isFirstInQueueRef.current = true;
    updateQueueLength();

    await unloadCurrent();
    await unloadPreloaded();

    // Put the URL at the front and process
    queueRef.current.unshift(url);
    updateQueueLength();
    await processQueue();
  }, [unloadCurrent, unloadPreloaded, processQueue, updateQueueLength]);

  const stopAudio = useCallback(async () => {
    queueRef.current = [];
    isPlayingQueueRef.current = false;
    isFirstInQueueRef.current = true;
    updateQueueLength();

    await unloadPreloaded();

    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await unloadCurrent();
      } catch {
        // Ignore stop errors
      }
    }
    if (mountedRef.current) {
      setIsPlaying(false);
      setProgress(0);
    }
  }, [unloadCurrent, unloadPreloaded, updateQueueLength]);

  const pauseAudio = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.pauseAsync();
        if (mountedRef.current) {
          setIsPlaying(false);
        }
      } catch (error) {
        console.error('Failed to pause audio:', error);
      }
    }
  }, []);

  const queueAudio = useCallback((url: string) => {
    queueRef.current.push(url);
    updateQueueLength();

    // Start processing queue if not already playing
    if (!isPlayingQueueRef.current) {
      isPlayingQueueRef.current = true;
      isFirstInQueueRef.current = true;
      processQueue();
    } else {
      // Pre-load if we have exactly one item queued (the one just added)
      if (queueRef.current.length === 1) {
        preloadNext();
      }
    }
  }, [processQueue, preloadNext, updateQueueLength]);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
    updateQueueLength();
    unloadPreloaded();
  }, [unloadPreloaded, updateQueueLength]);

  return {
    isPlaying,
    progress,
    duration,
    playAudio,
    stopAudio,
    pauseAudio,
    queueAudio,
    clearQueue,
    queueLength,
  };
}
