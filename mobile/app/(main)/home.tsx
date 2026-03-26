import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
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
} from '../../constants/theme';
import { Button } from '../../components/Button';
import { SessionCard } from '../../components/SessionCard';
import { useAuthStore } from '../../stores/authStore';
import { useGameStore, GameSessionSummary } from '../../stores/gameStore';
import { apiClient } from '../../services/api';
import { A11yHints } from '../../utils/accessibility';

export default function HomeScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const {
    sessions,
    sessionsLoading,
    currentSession,
    setSessions,
    setSessionsLoading,
    startSession,
    addMessage,
    loadPersistedTranscript,
  } = useGameStore();

  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Staggered animation for session cards on first load
  const cardAnimations = useRef<Map<string, Animated.Value>>(new Map());

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    setFetchError(null);
    try {
      const data = await apiClient.game.listSessions();
      setSessions(
        data.map((s) => ({
          id: s.id,
          characterName: s.characterName,
          characterClass: s.characterClass as GameSessionSummary['characterClass'],
          lastPlayed: s.lastPlayed,
          turnsPlayed: s.turnsPlayed,
          currentLocation: s.currentLocation,
          status: s.status,
        })),
      );
      setHasLoadedOnce(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load adventures';
      setFetchError(message);
    } finally {
      setSessionsLoading(false);
    }
  }, [setSessions, setSessionsLoading]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Trigger staggered animations when sessions are first loaded
  useEffect(() => {
    if (!hasLoadedOnce || sessions.length === 0) return;

    sessions.forEach((session, index) => {
      if (!cardAnimations.current.has(session.id)) {
        const anim = new Animated.Value(0);
        cardAnimations.current.set(session.id, anim);
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          delay: index * 80, // Staggered delay
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      }
    });
  }, [hasLoadedOnce, sessions]);

  const activeSession = sessions.find((s) => s.status === 'active');

  const handleNewAdventure = () => {
    if (activeSession) {
      Alert.alert(
        'Active Adventure',
        `You have an active adventure with ${activeSession.characterName}. Starting a new one will pause it. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Start New',
            onPress: () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/(main)/new-game');
            },
          },
        ],
      );
    } else {
      router.push('/(main)/new-game');
    }
  };

  const handleContinueAdventure = useCallback(async () => {
    if (!activeSession) return;
    handleSessionPress(activeSession.id);
  }, [activeSession]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSessionPress = useCallback(async (id: string) => {
    setLoadingSessionId(id);
    try {
      const sessionData = await apiClient.game.getSession(id);

      startSession({
        sessionId: sessionData.id,
        character: {
          id: sessionData.character.id,
          name: sessionData.character.name,
          class: sessionData.character.class as GameSessionSummary['characterClass'],
          level: sessionData.character.level,
          health: sessionData.character.health,
          maxHealth: sessionData.character.maxHealth,
          inventory: sessionData.character.inventory,
          gold: sessionData.character.gold,
          abilities: sessionData.character.abilities,
        },
        currentLocation: sessionData.gameState.currentLocation,
        activeQuest: sessionData.gameState.activeQuest,
        questProgress: sessionData.gameState.questProgress,
        turnsPlayed: sessionData.gameState.turnsPlayed,
        timeElapsedMinutes: sessionData.gameState.timeElapsedMinutes,
        lastSavedAt: sessionData.gameState.lastSavedAt,
      });

      const localTranscript = await loadPersistedTranscript(id);
      if (localTranscript.length > 0) {
        useGameStore.setState({ transcript: localTranscript });
      } else if (sessionData.recentTranscript?.length > 0) {
        const messages = sessionData.recentTranscript.map((msg, idx) => ({
          id: `msg-restored-${idx}`,
          role: msg.role,
          text: msg.text,
          timestamp: msg.timestamp,
        }));
        useGameStore.setState({ transcript: messages });
      }

      router.push(`/(main)/game/${id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load session';
      useGameStore.getState().setError(message);
      Alert.alert('Error', message);
    } finally {
      setLoadingSessionId(null);
    }
  }, [router, startSession, addMessage, loadPersistedTranscript]);

  const handleSettings = () => {
    router.push('/(main)/settings');
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>{'\uD83D\uDD2E'}</Text>
      <Text style={styles.emptyTitle}>Your Adventure Awaits!</Text>
      <Text style={styles.emptySubtitle}>
        The ancient scrolls lie unopened.{'\n'}
        Create your first hero and begin your tale.
      </Text>
    </View>
  );

  const renderSessionItem = ({ item, index }: { item: GameSessionSummary; index: number }) => {
    if (activeSession && item.id === activeSession.id) return null;

    // Get staggered animation value
    let animValue = cardAnimations.current.get(item.id);
    if (!animValue) {
      animValue = new Animated.Value(1);
      cardAnimations.current.set(item.id, animValue);
    }

    const translateY = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [30, 0],
    });

    return (
      <Animated.View
        style={{
          opacity: animValue,
          transform: [{ translateY }],
        }}
      >
        <SessionCard
          session={item}
          onPress={handleSessionPress}
        />
        {loadingSessionId === item.id && (
          <View style={styles.sessionLoadingOverlay}>
            <ActivityIndicator size="small" color={Colors.gold} />
            <Text style={styles.sessionLoadingText}>Loading adventure...</Text>
          </View>
        )}
      </Animated.View>
    );
  };

  const otherSessions = activeSession
    ? sessions.filter((s) => s.id !== activeSession.id)
    : sessions;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header} accessibilityRole="header">
        <View style={styles.headerLeft}>
          <Text
            style={styles.greeting}
            accessibilityRole="header"
          >
            Welcome, {user?.displayName ?? 'Adventurer'}!
          </Text>
          <Text style={styles.subGreeting}>What tale awaits you today?</Text>
        </View>
        <TouchableOpacity
          onPress={handleSettings}
          style={styles.settingsButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Open settings"
          accessibilityRole="button"
          accessibilityHint="Double tap to open application settings"
        >
          <Text style={styles.settingsIcon}>{'\u2699\uFE0F'}</Text>
        </TouchableOpacity>
      </View>

      {/* Continue Adventure CTA */}
      {activeSession && (
        <View style={styles.ctaContainer}>
          <TouchableOpacity
            onPress={handleContinueAdventure}
            activeOpacity={0.8}
            style={styles.continueCta}
            accessibilityRole="button"
            accessibilityLabel={`Continue adventure with ${activeSession.characterName}`}
            accessibilityHint={A11yHints.sessionCard}
          >
            <View style={styles.ctaContent}>
              <Text style={styles.ctaIcon}>
                {CLASS_ICONS[activeSession.characterClass] ?? '\u2694\uFE0F'}
              </Text>
              <View style={styles.ctaText}>
                <Text style={styles.ctaTitle}>Continue Adventure</Text>
                <Text style={styles.ctaCharName}>{activeSession.characterName}</Text>
                <Text style={styles.ctaLocation}>
                  {activeSession.currentLocation} - {activeSession.turnsPlayed} turns
                </Text>
              </View>
              <Text style={styles.ctaArrow}>{'\u203A'}</Text>
            </View>
            {loadingSessionId === activeSession.id && (
              <View style={styles.ctaLoadingOverlay}>
                <ActivityIndicator size="small" color={Colors.gold} />
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* New Adventure CTA */}
      <View style={styles.ctaContainer}>
        <TouchableOpacity
          onPress={handleNewAdventure}
          activeOpacity={0.8}
          style={[styles.ctaCard, activeSession && styles.ctaCardSecondary]}
          accessibilityRole="button"
          accessibilityLabel="Start a new adventure"
          accessibilityHint="Double tap to create a new character and start a fresh adventure"
        >
          <View style={styles.ctaContent}>
            <Text style={styles.ctaIcon}>{'\u2694\uFE0F'}</Text>
            <View style={styles.ctaText}>
              <Text style={[styles.ctaTitle, activeSession && styles.ctaTitleSecondary]}>
                New Adventure
              </Text>
              <Text style={styles.ctaSubtitle}>Create a character and dive in</Text>
            </View>
            <Text style={styles.ctaArrow}>{'\u203A'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Network Error */}
      {fetchError && (
        <TouchableOpacity
          onPress={fetchSessions}
          style={styles.networkError}
          accessibilityLabel="Network error. Tap to retry loading adventures."
          accessibilityRole="button"
        >
          <Text style={styles.networkErrorIcon}>{'\uD83D\uDD2E'}</Text>
          <View style={styles.networkErrorContent}>
            <Text style={styles.networkErrorText}>
              The magical realm flickers...
            </Text>
            <Text style={styles.networkErrorRetry}>Tap to reconnect</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Sessions List */}
      <View style={styles.sessionsContainer}>
        {otherSessions.length > 0 && (
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Your Adventures
          </Text>
        )}

        <FlatList
          data={otherSessions}
          renderItem={renderSessionItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={!activeSession ? renderEmptyState : null}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            otherSessions.length === 0 && !activeSession
              ? styles.emptyListContent
              : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={sessionsLoading}
              onRefresh={fetchSessions}
              tintColor={Colors.gold}
              colors={[Colors.gold]}
              progressBackgroundColor={Colors.backgroundLight}
            />
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  subGreeting: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.backgroundCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIcon: {
    fontSize: 22,
  },

  // CTAs
  ctaContainer: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  continueCta: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.gold,
    overflow: 'hidden',
    ...Shadow.md,
    ...Shadow.glow(Colors.goldDark),
  },
  ctaCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.goldDark,
    overflow: 'hidden',
    ...Shadow.md,
  },
  ctaCardSecondary: {
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.xl,
    minHeight: 48,
  },
  ctaIcon: {
    fontSize: 36,
    marginRight: Spacing.lg,
  },
  ctaText: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
  },
  ctaTitleSecondary: {
    color: Colors.textSecondary,
    fontSize: FontSize.lg,
  },
  ctaCharName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  ctaLocation: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  ctaSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  ctaArrow: {
    fontSize: 32,
    color: Colors.goldMuted,
    fontWeight: FontWeight.bold,
  },
  ctaLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13, 10, 26, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Network error
  networkError: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.xl,
    marginVertical: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.3)',
    minHeight: 48,
  },
  networkErrorIcon: {
    fontSize: 24,
    marginRight: Spacing.md,
    opacity: 0.6,
  },
  networkErrorContent: {
    flex: 1,
  },
  networkErrorText: {
    color: Colors.dangerLight,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
  networkErrorRetry: {
    color: Colors.gold,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    marginTop: 2,
  },

  // Sessions
  sessionsContainer: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.lg,
    opacity: 0.6,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  sessionLoadingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  sessionLoadingText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
});
