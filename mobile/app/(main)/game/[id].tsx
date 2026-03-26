import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  Alert,
  AppState,
  AppStateStatus,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
  CLASS_ICONS,
  CLASS_COLORS,
} from '../../../constants/theme';
import { Config } from '../../../constants/config';
import { HealthBar } from '../../../components/HealthBar';
import { ConnectionStatus } from '../../../components/ConnectionStatus';
import { CharacterPanel } from '../../../components/CharacterPanel';
import { DiceRoller } from '../../../components/DiceRoller';
import { SceneImage } from '../../../components/SceneImage';
import { CombatOverlay, CombatAction, CombatPhase, EnemyHealthEstimate } from '../../../components/CombatOverlay';
import { useGameStore, TranscriptMessage } from '../../../stores/gameStore';
import { useGameTurn } from '../../../hooks/useGameTurn';
import { useDiceRoll, DiceType } from '../../../hooks/useDiceRoll';
import { apiClient } from '../../../services/api';
import { A11yLabels, A11yHints, A11yRoles } from '../../../utils/accessibility';
import { AUTO_SAVE_EVERY_N_TURNS, MAX_IMAGES_PER_SESSION } from '../../../../shared/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MIC_BUTTON_SIZE = 80;

// Timer warning thresholds (seconds)
const TIMER_AMBER_SECONDS = 30 * 60; // 30 minutes
const TIMER_RED_SECONDS = 45 * 60; // 45 minutes
const TIMER_LIMIT_SECONDS = 60 * 60; // 60 minutes

// Edge case: max speech duration (seconds)
const MAX_SPEECH_DURATION_SECONDS = 30;

// ---- Dice roll request type from AI state updates ----
interface DiceRollRequest {
  diceType: DiceType;
  actionType: string;
  modifiers?: number;
}

// ---- Combat state from AI state updates ----
interface CombatState {
  enemyName: string;
  enemyHealthEstimate: EnemyHealthEstimate;
  enemyDescription?: string;
  phase: CombatPhase;
  rewards?: {
    gold?: number;
    xp?: number;
    items?: string[];
  } | null;
}

// ---- Scene image in transcript ----
interface SceneImageData {
  id: string;
  url: string | null;
  isLoading: boolean;
  error: string | null;
  position: number; // index in transcript where it should appear
}

export default function GameSessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const sessionId = id ?? '';

  const {
    currentSession,
    transcript,
    turnsSinceLastSave,
    lastSaveStatus,
    addMessage,
    endSession,
    updateGameState,
    persistTranscript,
    loadPersistedTranscript,
    incrementTurnCount,
    setLastSaveStatus,
    resetTurnsSinceLastSave,
  } = useGameStore();

  const gameTurn = useGameTurn(sessionId);

  const flatListRef = useRef<FlatList>(null);
  const [sessionTimer, setSessionTimer] = useState(0);
  const [isTextMode, setIsTextMode] = useState(false);
  const [textInput, setTextInput] = useState('');
  const appStateRef = useRef(AppState.currentState);
  const backgroundTimeRef = useRef<number>(0);
  const recordingStartRef = useRef<number>(0);

  // Edge case: double-tap prevention
  const micPressLockRef = useRef(false);

  // Edge case: pending abort controller for rapid navigation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Session timer notification state
  const [timerWarningShown, setTimerWarningShown] = useState(false);
  const [timerLimitReached, setTimerLimitReached] = useState(false);

  // Scene images state
  const [sceneImages, setSceneImages] = useState<SceneImageData[]>([]);
  const [imagesGenerated, setImagesGenerated] = useState(0);

  // ---- Dice roll integration ----
  const [pendingDiceRoll, setPendingDiceRoll] = useState<DiceRollRequest | null>(null);
  const diceRoll = useDiceRoll({
    sessionId,
    onRollComplete: (result) => {
      addMessage({
        id: `msg-dice-${Date.now()}`,
        role: 'system',
        text: `Rolled ${result.diceType}: ${result.rollValue} (total: ${result.total}) - ${result.success ? 'Success!' : 'Failure'}`,
        timestamp: Date.now(),
      });
    },
    onError: (error) => {
      addMessage({
        id: `msg-dice-error-${Date.now()}`,
        role: 'system',
        text: `Dice roll failed: ${error}`,
        timestamp: Date.now(),
      });
    },
  });

  // ---- Combat state ----
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [combatVisible, setCombatVisible] = useState(false);

  // Detect combat from game state updates
  useEffect(() => {
    const gameState = currentSession as Record<string, unknown> | null;
    if (!gameState) return;

    const world = gameState.world as { threatLevel?: string } | undefined;
    const combat = gameState.combat as CombatState | undefined;

    if (world?.threatLevel === 'critical' && combat) {
      setCombatState(combat);
      setCombatVisible(true);
    } else if (combatState?.phase === 'victory' || combatState?.phase === 'defeat') {
      // Keep visible during victory/defeat transitions
    } else if (world?.threatLevel !== 'critical') {
      setCombatVisible(false);
      setCombatState(null);
    }
  }, [currentSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect dice roll requests from AI state updates
  useEffect(() => {
    const gameState = currentSession as Record<string, unknown> | null;
    if (!gameState) return;

    const rollRequest = gameState.pendingDiceRoll as DiceRollRequest | undefined;
    if (rollRequest) {
      setPendingDiceRoll(rollRequest);
      updateGameState({ pendingDiceRoll: undefined } as Record<string, unknown>);
    }
  }, [currentSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect image_ready events from game state updates
  useEffect(() => {
    const gameState = currentSession as Record<string, unknown> | null;
    if (!gameState) return;

    const imageReady = gameState.sceneImage as { url: string; prompt?: string } | undefined;
    if (imageReady?.url) {
      const newImage: SceneImageData = {
        id: `scene-img-${Date.now()}`,
        url: imageReady.url,
        isLoading: false,
        error: null,
        position: transcript.length,
      };
      setSceneImages((prev) => [...prev, newImage]);
      setImagesGenerated((prev) => prev + 1);
      updateGameState({ sceneImage: undefined } as Record<string, unknown>);
    }

    const imageLoading = gameState.sceneImageLoading as boolean | undefined;
    if (imageLoading) {
      const loadingImage: SceneImageData = {
        id: `scene-img-loading-${Date.now()}`,
        url: null,
        isLoading: true,
        error: null,
        position: transcript.length,
      };
      setSceneImages((prev) => [...prev, loadingImage]);
      updateGameState({ sceneImageLoading: undefined } as Record<string, unknown>);
    }
  }, [currentSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animations
  const micScale = useRef(new Animated.Value(1)).current;
  const micPulse = useRef(new Animated.Value(0)).current;
  const micGlow = useRef(new Animated.Value(0)).current;
  const processingDots = useRef(new Animated.Value(0)).current;
  const waveformAnim = useRef(new Animated.Value(0)).current;
  const savedOpacity = useRef(new Animated.Value(0)).current;
  const orbSwirl = useRef(new Animated.Value(0)).current;
  const timerPulse = useRef(new Animated.Value(1)).current;
  const wrappingBarAnim = useRef(new Animated.Value(0)).current;

  // Message entrance animations map
  const messageAnimations = useRef<Map<string, Animated.Value>>(new Map());

  // ---- Load persisted transcript on mount ----
  useEffect(() => {
    if (!sessionId) return;

    (async () => {
      const persisted = await loadPersistedTranscript(sessionId);
      if (persisted.length > 0 && transcript.length === 0) {
        useGameStore.setState({ transcript: persisted });
      }
    })();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Session timer with background time tracking ----
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionTimer((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Timer warning animations
  useEffect(() => {
    if (sessionTimer >= TIMER_AMBER_SECONDS && sessionTimer < TIMER_RED_SECONDS) {
      // Gentle amber pulse at 30 min
      Animated.loop(
        Animated.sequence([
          Animated.timing(timerPulse, {
            toValue: 1.05,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(timerPulse, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    }

    if (sessionTimer >= TIMER_RED_SECONDS && !timerWarningShown) {
      setTimerWarningShown(true);
      // Show wrapping up notification
      Animated.timing(wrappingBarAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }

    if (sessionTimer >= TIMER_LIMIT_SECONDS && !timerLimitReached) {
      setTimerLimitReached(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [sessionTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Scroll to bottom on new messages ----
  useEffect(() => {
    if (transcript.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [transcript.length, gameTurn.currentNarration]);

  // ---- New message entrance animation ----
  useEffect(() => {
    if (transcript.length === 0) return;
    const lastMsg = transcript[transcript.length - 1];
    if (!messageAnimations.current.has(lastMsg.id)) {
      const anim = new Animated.Value(0);
      messageAnimations.current.set(lastMsg.id, anim);
      Animated.spring(anim, {
        toValue: 1,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }).start();
    }
  }, [transcript.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Recording: pulsing red glow (crystal orb) ----
  useEffect(() => {
    if (gameTurn.isRecording) {
      recordingStartRef.current = Date.now();

      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulse, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(micPulse, {
            toValue: 0,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(micGlow, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(micGlow, {
            toValue: 0.3,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();

      Animated.loop(
        Animated.timing(waveformAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      micPulse.setValue(0);
      micGlow.setValue(0);
      waveformAnim.setValue(0);
    }
  }, [gameTurn.isRecording, micPulse, micGlow, waveformAnim]);

  // ---- Processing: swirling magical energy ----
  useEffect(() => {
    if (gameTurn.isProcessing) {
      Animated.loop(
        Animated.timing(processingDots, {
          toValue: 3,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ).start();

      Animated.loop(
        Animated.timing(orbSwirl, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    } else {
      processingDots.setValue(0);
      orbSwirl.setValue(0);
    }
  }, [gameTurn.isProcessing, processingDots, orbSwirl]);

  // ---- AI speaking: gentle pulsation ----
  useEffect(() => {
    if (gameTurn.isPlayingAudio && !gameTurn.isRecording && !gameTurn.isProcessing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micGlow, {
            toValue: 0.7,
            duration: 1000,
            easing: Easing.inOut(Easing.sine),
            useNativeDriver: true,
          }),
          Animated.timing(micGlow, {
            toValue: 0.2,
            duration: 1000,
            easing: Easing.inOut(Easing.sine),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else if (!gameTurn.isRecording) {
      micGlow.setValue(0);
    }
  }, [gameTurn.isPlayingAudio, gameTurn.isRecording, gameTurn.isProcessing, micGlow]);

  // ---- Auto-save every N turns ----
  useEffect(() => {
    if (!gameTurn.isProcessing && turnsSinceLastSave >= AUTO_SAVE_EVERY_N_TURNS) {
      (async () => {
        setLastSaveStatus('saving');
        try {
          await apiClient.game.saveSession(sessionId);
          await persistTranscript();
          resetTurnsSinceLastSave();
          setLastSaveStatus('saved');

          Animated.sequence([
            Animated.timing(savedOpacity, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.delay(1500),
            Animated.timing(savedOpacity, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setLastSaveStatus('idle');
          });
        } catch {
          setLastSaveStatus('error');
        }
      })();
    }
  }, [gameTurn.isProcessing, turnsSinceLastSave]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Track turn completions for auto-save ----
  const prevProcessingRef = useRef(gameTurn.isProcessing);
  useEffect(() => {
    if (prevProcessingRef.current && !gameTurn.isProcessing) {
      incrementTurnCount();
    }
    prevProcessingRef.current = gameTurn.isProcessing;
  }, [gameTurn.isProcessing, incrementTurnCount]);

  // ---- App state listener for background save + timer pause ----
  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (
        appStateRef.current === 'active' &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        // Save on background
        apiClient.game.saveSession(sessionId).catch(() => {});
        persistTranscript().catch(() => {});
        // Track background time for timer pause
        backgroundTimeRef.current = Date.now();
      } else if (
        (appStateRef.current === 'background' || appStateRef.current === 'inactive') &&
        nextState === 'active'
      ) {
        // Resume: do NOT add background time to session timer
        // Timer was paused because setInterval doesn't run in background
        // Just reset the background time tracker
        backgroundTimeRef.current = 0;
      }
      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, [sessionId, persistTranscript]);

  // ---- Cleanup on unmount (rapid navigation) ----
  useEffect(() => {
    return () => {
      // Abort any pending requests on navigation away
      abortControllerRef.current?.abort();
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getTimerColor = (): string => {
    if (sessionTimer >= TIMER_RED_SECONDS) return Colors.dangerLight;
    if (sessionTimer >= TIMER_AMBER_SECONDS) return Colors.warning;
    return Colors.textMuted;
  };

  // ---- Mic button handler with edge case protection ----
  const handleMicPress = async () => {
    // Edge case: prevent double-tap
    if (micPressLockRef.current) return;
    if (gameTurn.isProcessing) return;

    // Edge case: don't start recording while AI is narrating (queue behavior)
    if (gameTurn.isPlayingAudio) {
      // Stop audio first, then allow recording
      await gameTurn.stopAudio();
    }

    micPressLockRef.current = true;
    setTimeout(() => { micPressLockRef.current = false; }, 300);

    if (gameTurn.isRecording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Mic button: smooth spring animation on release
      Animated.spring(micScale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }).start();

      // Edge case: check recording duration for very long speech
      const recordingDuration = (Date.now() - recordingStartRef.current) / 1000;
      if (recordingDuration > MAX_SPEECH_DURATION_SECONDS) {
        addMessage({
          id: `msg-system-${Date.now()}`,
          role: 'system',
          text: `Your message was quite long (${Math.round(recordingDuration)}s). It will be trimmed to the first ${MAX_SPEECH_DURATION_SECONDS} seconds.`,
          timestamp: Date.now(),
        });
      }

      await gameTurn.stopRecordingAndSubmit();
    } else {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // Mic button: spring press animation
        Animated.spring(micScale, {
          toValue: 0.88,
          friction: 5,
          tension: 60,
          useNativeDriver: true,
        }).start();

        await gameTurn.startRecording();
      } catch {
        setIsTextMode(true);
        addMessage({
          id: `msg-system-${Date.now()}`,
          role: 'system',
          text: 'Microphone unavailable. Switched to text input.',
          timestamp: Date.now(),
        });
      }
    }
  };

  // ---- Text submit handler ----
  const handleTextSubmit = async () => {
    if (!textInput.trim() || gameTurn.isProcessing) return;
    const text = textInput.trim();
    setTextInput('');
    await gameTurn.submitTextTurn(text);
  };

  // ---- Save & quit ----
  const handleSaveAndQuit = () => {
    Alert.alert(
      'Save & Quit',
      'Your progress will be saved. You can continue this adventure later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save & Quit',
          onPress: async () => {
            try {
              abortControllerRef.current?.abort();
              await gameTurn.stopAudio();
              await apiClient.game.saveSession(sessionId);
              await persistTranscript();
            } catch {
              // Continue with quit even if save fails
            }
            endSession();
            router.replace('/(main)/home');
          },
        },
      ],
    );
  };

  // ---- Retry handler ----
  const handleRetry = () => {
    gameTurn.retryLastTurn();
  };

  // ---- Dice roll handlers ----
  const handleDiceRollRequested = useCallback((dt: DiceType) => {
    if (pendingDiceRoll) {
      diceRoll.rollDice(dt, pendingDiceRoll.actionType, pendingDiceRoll.modifiers);
    }
  }, [pendingDiceRoll, diceRoll]);

  const handleDiceDismiss = useCallback(() => {
    setPendingDiceRoll(null);
    diceRoll.clearResult();
  }, [diceRoll]);

  // ---- Combat handlers ----
  const handleCombatAction = useCallback((action: CombatAction) => {
    gameTurn.submitTextTurn(`[COMBAT] I choose to ${action}!`);
  }, [gameTurn]);

  const handleCombatDismiss = useCallback(() => {
    setCombatVisible(false);
    setCombatState(null);
  }, []);

  const handleDeathSave = useCallback(() => {
    setPendingDiceRoll({ diceType: 'd20', actionType: 'death_save' });
    if (combatState) {
      setCombatState({ ...combatState, phase: 'rolling' });
    }
  }, [combatState]);

  // ---- Render message with entrance animation ----
  const renderMessage = ({ item, index }: { item: TranscriptMessage; index: number }) => {
    const isNarrator = item.role === 'narrator';
    const isSystem = item.role === 'system';
    const isPlayer = item.role === 'player';

    // Get or create entrance animation for this message
    let animValue = messageAnimations.current.get(item.id);
    if (!animValue) {
      animValue = new Animated.Value(1); // Already visible for older messages
      messageAnimations.current.set(item.id, animValue);
    }

    const translateY = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [20, 0],
    });

    // Check if a scene image should appear after this message
    const imageAfterMessage = sceneImages.find((img) => img.position === index + 1);

    return (
      <View>
        <Animated.View
          style={[
            styles.messageContainer,
            isPlayer && styles.playerMessage,
            isSystem && styles.systemMessage,
            {
              opacity: animValue,
              transform: [{ translateY }],
            },
          ]}
          accessibilityRole="text"
          accessibilityLabel={
            isNarrator
              ? `Dungeon Master says: ${item.text}`
              : isPlayer
                ? `You said: ${item.text}`
                : item.text
          }
        >
          {isNarrator && (
            <View style={styles.narratorHeader} accessibilityRole="header">
              <Text style={styles.narratorIcon}>{'\uD83C\uDFAD'}</Text>
              <Text style={styles.narratorLabel}>Dungeon Master</Text>
            </View>
          )}
          {isPlayer && (
            <View style={styles.playerHeader}>
              <Text style={styles.playerLabel}>You</Text>
            </View>
          )}
          <Text
            style={[
              styles.messageText,
              isNarrator && styles.narratorText,
              isPlayer && styles.playerText,
              isSystem && styles.systemText,
            ]}
          >
            {item.text}
          </Text>
        </Animated.View>

        {/* Scene image inserted at the correct transcript position */}
        {imageAfterMessage && (
          <SceneImage
            imageUrl={imageAfterMessage.url}
            isLoading={imageAfterMessage.isLoading}
            error={imageAfterMessage.error}
            counterText={
              imagesGenerated > 0
                ? `${imagesGenerated}/${MAX_IMAGES_PER_SESSION} images`
                : undefined
            }
            altText="AI-generated scene illustration"
          />
        )}
      </View>
    );
  };

  const character = currentSession?.character;
  const classColor = character ? CLASS_COLORS[character.class] ?? Colors.gold : Colors.gold;

  // Orb swirl rotation
  const orbRotation = orbSwirl.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Character Panel (expandable) */}
      {character && (
        <CharacterPanel
          character={character}
          level={character.level}
          xp={currentSession?.turnsPlayed ? currentSession.turnsPlayed * 10 : undefined}
          xpToNextLevel={100}
          currentLocation={currentSession?.currentLocation}
          activeQuest={currentSession?.activeQuest}
          questProgress={currentSession?.questProgress}
        />
      )}

      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarRight}>
          <ConnectionStatus
            isConnected={gameTurn.sseConnected}
            isReconnecting={gameTurn.sseReconnecting}
          />

          <View style={styles.timerRow}>
            <Animated.Text
              style={[
                styles.timer,
                { color: getTimerColor(), transform: [{ scale: timerPulse }] },
              ]}
              accessibilityLabel={A11yLabels.sessionTimer(formatTime(sessionTimer))}
              accessibilityRole="timer"
            >
              {formatTime(sessionTimer)}
            </Animated.Text>
            <Animated.Text style={[styles.savedText, { opacity: savedOpacity }]}>
              Saved
            </Animated.Text>
          </View>

          <TouchableOpacity
            onPress={handleSaveAndQuit}
            style={styles.saveButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={A11yLabels.saveAndQuit}
            accessibilityRole="button"
            accessibilityHint="Double tap to save your progress and return to the home screen"
          >
            <Text style={styles.saveButtonText}>Save & Quit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Session timer warnings */}
      {timerWarningShown && !timerLimitReached && (
        <Animated.View
          style={[
            styles.timerWarningBar,
            { opacity: wrappingBarAnim },
          ]}
        >
          <Text style={styles.timerWarningText}>
            The AI is wrapping up your adventure...
          </Text>
        </Animated.View>
      )}
      {timerLimitReached && (
        <View style={styles.timerLimitBar}>
          <Text style={styles.timerLimitText}>
            Your adventure pauses here. Progress saved.
          </Text>
        </View>
      )}

      {/* Location bar */}
      {currentSession?.currentLocation && (
        <View
          style={styles.locationBar}
          accessibilityLabel={`Location: ${currentSession.currentLocation}`}
          accessibilityRole="text"
        >
          <Text style={styles.locationIcon}>{'\uD83D\uDCCD'}</Text>
          <Text style={styles.locationText} numberOfLines={1}>
            {currentSession.currentLocation}
          </Text>
        </View>
      )}

      {/* Transcript */}
      <KeyboardAvoidingView
        style={styles.flexOne}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={transcript}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          style={styles.transcript}
          contentContainerStyle={styles.transcriptContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyTranscript}>
              <Text style={styles.emptyIcon}>{'\uD83D\uDD2E'}</Text>
              <Text style={styles.emptyText}>
                {isTextMode
                  ? 'Type your action below\nto begin your adventure'
                  : 'Press the crystal orb and speak\nto begin your adventure'}
              </Text>
            </View>
          }
        />

        {/* Pending Dice Roll (inline, not combat) */}
        {pendingDiceRoll && !combatVisible && (
          <View style={styles.diceRollContainer}>
            <DiceRoller
              diceType={pendingDiceRoll.diceType}
              onRollRequested={handleDiceRollRequested}
              rollValue={diceRoll.result?.rollValue ?? null}
              total={diceRoll.result?.total ?? null}
              success={diceRoll.result?.success ?? null}
              narration={diceRoll.result?.narration ?? null}
              isRolling={diceRoll.isRolling}
              actionLabel={`Roll ${pendingDiceRoll.diceType.toUpperCase()} for ${pendingDiceRoll.actionType}!`}
              onDismiss={handleDiceDismiss}
            />
          </View>
        )}

        {/* Processing indicator */}
        {gameTurn.isProcessing && !gameTurn.currentNarration && (
          <View style={styles.processingContainer}>
            <View style={styles.processingBubble}>
              <Text style={styles.processingIcon}>{'\uD83C\uDFAD'}</Text>
              <Text style={styles.processingText}>
                The Dungeon Master ponders...
              </Text>
              <View style={styles.processingDotsContainer}>
                {[0, 1, 2].map((i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.processingDot,
                      {
                        opacity: processingDots.interpolate({
                          inputRange: [i, i + 0.5, i + 1],
                          outputRange: [0.3, 1, 0.3],
                          extrapolate: 'clamp',
                        }),
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Transcription display */}
        {gameTurn.currentTranscription && (
          <View
            style={styles.transcriptionContainer}
            accessibilityLabel={`Transcribed: ${gameTurn.currentTranscription}`}
            accessibilityRole="text"
          >
            <Text style={styles.transcriptionLabel}>You said:</Text>
            <Text style={styles.transcriptionText}>
              {gameTurn.currentTranscription}
            </Text>
          </View>
        )}

        {/* Error with retry */}
        {gameTurn.error && !gameTurn.isProcessing && (
          <TouchableOpacity
            onPress={handleRetry}
            style={styles.errorContainer}
            accessibilityLabel={`Error: ${gameTurn.error}. Tap to retry.`}
            accessibilityRole="button"
            accessibilityHint={A11yHints.retryButton}
          >
            <Text style={styles.errorIcon}>{'\u26A0\uFE0F'}</Text>
            <View style={styles.errorTextContainer}>
              <Text style={styles.errorText}>
                The magical realm flickers... {gameTurn.error}
              </Text>
              <Text style={styles.errorRetry}>Tap to retry</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Input Area */}
        {isTextMode ? (
          <View style={styles.textInputArea}>
            <TouchableOpacity
              onPress={() => setIsTextMode(false)}
              style={styles.modeToggle}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={A11yLabels.switchToVoice}
              accessibilityRole="button"
              accessibilityHint="Double tap to switch to voice input mode"
            >
              <Text style={styles.modeToggleIcon}>{'\uD83C\uDF99\uFE0F'}</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.textInputField}
              value={textInput}
              onChangeText={setTextInput}
              placeholder="Describe your action..."
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={500}
              editable={!gameTurn.isProcessing}
              returnKeyType="send"
              blurOnSubmit
              onSubmitEditing={handleTextSubmit}
              accessibilityLabel="Type your action"
              accessibilityHint="Enter text to describe what your character does"
            />

            <TouchableOpacity
              onPress={handleTextSubmit}
              disabled={!textInput.trim() || gameTurn.isProcessing}
              style={[
                styles.sendButton,
                (!textInput.trim() || gameTurn.isProcessing) && styles.sendButtonDisabled,
              ]}
              accessibilityLabel={A11yLabels.sendMessage}
              accessibilityRole="button"
              accessibilityState={{ disabled: !textInput.trim() || gameTurn.isProcessing }}
            >
              <Text style={styles.sendButtonText}>{'\u27A4'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.micArea}>
            {/* Waveform visualization during recording */}
            {gameTurn.isRecording && (
              <View style={styles.waveformContainer} accessibilityElementsHidden>
                {Array.from({ length: 7 }).map((_, i) => (
                  <Animated.View
                    key={i}
                    style={[
                      styles.waveformBar,
                      {
                        height: Animated.multiply(
                          waveformAnim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: [8, 24 + Math.random() * 16, 8],
                          }),
                          1,
                        ),
                        opacity: 0.6 + Math.random() * 0.4,
                      },
                    ]}
                  />
                ))}
              </View>
            )}

            {/* Status text */}
            <Text
              style={styles.micStatus}
              accessibilityLabel={
                gameTurn.isRecording
                  ? 'Recording. Tap the orb to send.'
                  : gameTurn.isProcessing
                    ? 'Processing your action'
                    : gameTurn.isPlayingAudio
                      ? 'The Dungeon Master is speaking'
                      : 'Ready. Tap the orb to speak.'
              }
            >
              {gameTurn.isRecording
                ? 'Listening... Tap the orb to send'
                : gameTurn.isProcessing
                  ? 'Channeling magic...'
                  : gameTurn.isPlayingAudio
                    ? 'The Dungeon Master speaks...'
                    : 'Tap the orb to speak'}
            </Text>

            <View style={styles.micRowContainer}>
              {/* Text mode toggle */}
              <TouchableOpacity
                onPress={() => setIsTextMode(true)}
                style={styles.modeToggleSmall}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={A11yLabels.switchToText}
                accessibilityRole="button"
                accessibilityHint="Double tap to switch to text input mode"
              >
                <Text style={styles.modeToggleSmallIcon}>{'\u2328\uFE0F'}</Text>
              </TouchableOpacity>

              {/* Crystal Orb mic button */}
              <View style={styles.micButtonWrapper}>
                {/* Outer glow ring */}
                <Animated.View
                  style={[
                    styles.orbGlowOuter,
                    gameTurn.isRecording && {
                      backgroundColor: Colors.danger,
                      opacity: micGlow,
                    },
                    gameTurn.isProcessing && {
                      backgroundColor: Colors.purple,
                      opacity: micGlow.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.1, 0.4],
                      }),
                      transform: [{ rotate: orbRotation }],
                    },
                    gameTurn.isPlayingAudio && !gameTurn.isRecording && !gameTurn.isProcessing && {
                      backgroundColor: Colors.gold,
                      opacity: micGlow,
                    },
                  ]}
                  accessibilityElementsHidden
                />

                {/* Pulse ring (recording) */}
                {gameTurn.isRecording && (
                  <Animated.View
                    style={[
                      styles.micPulseRing,
                      {
                        opacity: micPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 0],
                        }),
                        transform: [
                          {
                            scale: micPulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, 1.8],
                            }),
                          },
                        ],
                      },
                    ]}
                    accessibilityElementsHidden
                  />
                )}

                <Animated.View style={{ transform: [{ scale: micScale }] }}>
                  <TouchableOpacity
                    onPress={handleMicPress}
                    disabled={gameTurn.isProcessing}
                    activeOpacity={0.8}
                    style={[
                      styles.micButton,
                      gameTurn.isRecording && styles.micButtonRecording,
                      gameTurn.isProcessing && styles.micButtonProcessing,
                      gameTurn.isPlayingAudio && !gameTurn.isRecording && !gameTurn.isProcessing && styles.micButtonSpeaking,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={
                      gameTurn.isRecording
                        ? A11yLabels.stopRecording
                        : A11yLabels.startRecording
                    }
                    accessibilityHint={
                      gameTurn.isRecording
                        ? A11yHints.micButtonRecording
                        : A11yHints.micButton
                    }
                    accessibilityState={{ disabled: gameTurn.isProcessing }}
                  >
                    <View style={styles.orbInnerRing} />
                    <Text style={styles.micIcon}>
                      {gameTurn.isRecording
                        ? '\uD83D\uDD34'
                        : gameTurn.isProcessing
                          ? '\uD83C\uDF00'
                          : '\uD83D\uDD2E'}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              </View>

              {/* Spacer for symmetry */}
              <View style={styles.modeToggleSmall} />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Combat Overlay */}
      <CombatOverlay
        visible={combatVisible}
        phase={combatState?.phase ?? 'active'}
        enemy={combatState ? {
          name: combatState.enemyName,
          healthEstimate: combatState.enemyHealthEstimate,
          description: combatState.enemyDescription,
        } : null}
        onAction={handleCombatAction}
        diceType={pendingDiceRoll?.diceType ?? 'd20'}
        onRollRequested={handleDiceRollRequested}
        rollValue={diceRoll.result?.rollValue ?? null}
        rollTotal={diceRoll.result?.total ?? null}
        rollSuccess={diceRoll.result?.success ?? null}
        rollNarration={diceRoll.result?.narration ?? null}
        isRolling={diceRoll.isRolling}
        rewards={combatState?.rewards}
        onDismiss={handleCombatDismiss}
        onDeathSave={handleDeathSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flexOne: {
    flex: 1,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.backgroundLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  topBarRight: {
    alignItems: 'flex-end',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  timer: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    fontVariant: ['tabular-nums'],
  },
  savedText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  saveButton: {
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    marginTop: 2,
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonText: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },

  // Timer warnings
  timerWarningBar: {
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 193, 7, 0.3)',
  },
  timerWarningText: {
    color: Colors.warning,
    fontSize: FontSize.sm,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  timerLimitBar: {
    backgroundColor: 'rgba(229, 57, 53, 0.2)',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(229, 57, 53, 0.3)',
  },
  timerLimitText: {
    color: Colors.dangerLight,
    fontSize: FontSize.md,
    textAlign: 'center',
    fontWeight: FontWeight.bold,
  },

  // Location bar
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.backgroundLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  locationIcon: {
    fontSize: 12,
    marginRight: Spacing.xs,
  },
  locationText: {
    color: Colors.goldMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.5,
  },

  // Dice Roll Container
  diceRollContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },

  // Transcript
  transcript: {
    flex: 1,
  },
  transcriptContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexGrow: 1,
  },
  emptyTranscript: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.lg,
    opacity: 0.5,
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Messages
  messageContainer: {
    marginBottom: Spacing.lg,
    maxWidth: '92%',
  },
  playerMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderBottomRightRadius: BorderRadius.sm,
    padding: Spacing.md,
  },
  systemMessage: {
    alignSelf: 'center',
    maxWidth: '80%',
  },
  narratorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  narratorIcon: {
    fontSize: 14,
    marginRight: Spacing.xs,
  },
  narratorLabel: {
    color: Colors.goldMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  playerHeader: {
    marginBottom: Spacing.xs,
  },
  playerLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textAlign: 'right',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageText: {
    fontSize: FontSize.md,
    lineHeight: 24,
  },
  narratorText: {
    color: Colors.textPrimary,
    fontStyle: 'italic',
  },
  playerText: {
    color: Colors.textSecondary,
  },
  systemText: {
    color: Colors.warning,
    textAlign: 'center',
    fontStyle: 'italic',
    fontSize: FontSize.sm,
  },

  // Transcription display
  transcriptionContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.backgroundLight,
  },
  transcriptionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  transcriptionText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },

  // Processing
  processingContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  processingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadow.sm,
  },
  processingIcon: {
    fontSize: 18,
    marginRight: Spacing.sm,
  },
  processingText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    flex: 1,
  },
  processingDotsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  processingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gold,
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.3)',
    minHeight: 48,
  },
  errorIcon: {
    fontSize: 20,
    marginRight: Spacing.sm,
  },
  errorTextContainer: {
    flex: 1,
  },
  errorText: {
    color: Colors.dangerLight,
    fontSize: FontSize.sm,
  },
  errorRetry: {
    color: Colors.gold,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    marginTop: 2,
  },

  // Text input area
  textInputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingBottom: Spacing.xxl,
    backgroundColor: Colors.backgroundLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  modeToggle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeToggleIcon: {
    fontSize: 20,
  },
  textInputField: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.surface,
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 20,
    color: Colors.background,
  },

  // Mic area
  micArea: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingBottom: Spacing.xxl,
    backgroundColor: Colors.backgroundLight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    gap: 4,
    marginBottom: Spacing.sm,
  },
  waveformBar: {
    width: 4,
    backgroundColor: Colors.dangerLight,
    borderRadius: 2,
  },
  micStatus: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
    letterSpacing: 0.5,
  },
  micRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xl,
  },
  modeToggleSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeToggleSmallIcon: {
    fontSize: 20,
  },
  micButtonWrapper: {
    position: 'relative',
    width: MIC_BUTTON_SIZE + 40,
    height: MIC_BUTTON_SIZE + 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbGlowOuter: {
    position: 'absolute',
    width: MIC_BUTTON_SIZE + 20,
    height: MIC_BUTTON_SIZE + 20,
    borderRadius: (MIC_BUTTON_SIZE + 20) / 2,
    backgroundColor: Colors.purple,
    opacity: 0,
  },
  micPulseRing: {
    position: 'absolute',
    width: MIC_BUTTON_SIZE,
    height: MIC_BUTTON_SIZE,
    borderRadius: MIC_BUTTON_SIZE / 2,
    backgroundColor: Colors.danger,
  },
  micButton: {
    width: MIC_BUTTON_SIZE,
    height: MIC_BUTTON_SIZE,
    borderRadius: MIC_BUTTON_SIZE / 2,
    backgroundColor: Colors.micIdle,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.borderLight,
    ...Shadow.lg,
    shadowColor: Colors.purple,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  micButtonRecording: {
    backgroundColor: '#3A1020',
    borderColor: Colors.dangerLight,
    ...Shadow.glow(Colors.danger),
  },
  micButtonProcessing: {
    backgroundColor: '#1A1040',
    borderColor: Colors.purpleLight,
    ...Shadow.glow(Colors.purple),
  },
  micButtonSpeaking: {
    backgroundColor: '#2A2010',
    borderColor: Colors.goldDark,
    ...Shadow.glow(Colors.gold),
  },
  orbInnerRing: {
    position: 'absolute',
    width: MIC_BUTTON_SIZE - 16,
    height: MIC_BUTTON_SIZE - 16,
    borderRadius: (MIC_BUTTON_SIZE - 16) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  micIcon: {
    fontSize: 32,
  },
});
