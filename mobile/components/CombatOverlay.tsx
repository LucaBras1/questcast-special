import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Modal,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '../constants/theme';
import { DiceRoller } from './DiceRoller';
import type { DiceType } from '../hooks/useDiceRoll';

// ============================================
// Combat Overlay
// Full-screen overlay when combat is active
// Shows enemy info, action buttons, dice roller
// Victory/defeat states with animations
// ============================================

export type CombatAction = 'attack' | 'defend' | 'spell' | 'flee';

export type EnemyHealthEstimate = 'Healthy' | 'Wounded' | 'Near Death' | 'Unknown';

export type CombatPhase = 'active' | 'rolling' | 'victory' | 'defeat';

interface EnemyInfo {
  name: string;
  healthEstimate: EnemyHealthEstimate;
  description?: string;
}

interface CombatRewards {
  gold?: number;
  xp?: number;
  items?: string[];
}

interface CombatOverlayProps {
  /** Whether combat is active */
  visible: boolean;
  /** Current combat phase */
  phase: CombatPhase;
  /** Enemy information */
  enemy: EnemyInfo | null;
  /** Called when player selects a combat action */
  onAction?: (action: CombatAction) => void;
  /** Dice roller props (shown during rolling phase) */
  diceType?: DiceType;
  onRollRequested?: (diceType: DiceType) => void;
  rollValue?: number | null;
  rollTotal?: number | null;
  rollSuccess?: boolean | null;
  rollNarration?: string | null;
  isRolling?: boolean;
  /** Victory rewards */
  rewards?: CombatRewards | null;
  /** Called when user dismisses victory/defeat screen */
  onDismiss?: () => void;
  /** Called on death save (defeat phase) */
  onDeathSave?: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const HEALTH_COLORS: Record<EnemyHealthEstimate, string> = {
  Healthy: Colors.healthGreen,
  Wounded: Colors.healthYellow,
  'Near Death': Colors.healthRed,
  Unknown: Colors.textMuted,
};

const ACTION_CONFIG: Record<CombatAction, { icon: string; label: string; color: string }> = {
  attack: { icon: '\u2694\uFE0F', label: 'Attack', color: Colors.warrior },
  defend: { icon: '\uD83D\uDEE1\uFE0F', label: 'Defend', color: Colors.blue },
  spell: { icon: '\u2728', label: 'Spell', color: Colors.purple },
  flee: { icon: '\uD83C\uDFC3', label: 'Flee', color: Colors.goldDark },
};

export function CombatOverlay({
  visible,
  phase,
  enemy,
  onAction,
  diceType = 'd20',
  onRollRequested,
  rollValue,
  rollTotal,
  rollSuccess,
  rollNarration,
  isRolling = false,
  rewards,
  onDismiss,
  onDeathSave,
}: CombatOverlayProps) {
  // Border pulse animation
  const borderPulse = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const contentSlide = useRef(new Animated.Value(50)).current;
  const victoryShimmer = useRef(new Animated.Value(0)).current;
  const defeatDarken = useRef(new Animated.Value(0)).current;

  // Entry animation
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(contentSlide, {
          toValue: 0,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();

      // Red border pulse for active combat
      if (phase === 'active' || phase === 'rolling') {
        Animated.loop(
          Animated.sequence([
            Animated.timing(borderPulse, {
              toValue: 1,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(borderPulse, {
              toValue: 0,
              duration: 1200,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ).start();
      }
    } else {
      overlayOpacity.setValue(0);
      contentSlide.setValue(50);
      borderPulse.setValue(0);
      victoryShimmer.setValue(0);
      defeatDarken.setValue(0);
    }
  }, [visible, phase, overlayOpacity, contentSlide, borderPulse, victoryShimmer, defeatDarken]);

  // Victory shimmer animation
  useEffect(() => {
    if (phase === 'victory') {
      borderPulse.stopAnimation();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Animated.loop(
        Animated.timing(victoryShimmer, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();
    }
  }, [phase, victoryShimmer, borderPulse]);

  // Defeat darken animation
  useEffect(() => {
    if (phase === 'defeat') {
      borderPulse.stopAnimation();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      Animated.timing(defeatDarken, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [phase, defeatDarken, borderPulse]);

  const handleAction = useCallback((action: CombatAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAction?.(action);
  }, [onAction]);

  if (!visible) return null;

  const borderOpacity = borderPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        {/* Red pulse border */}
        {(phase === 'active' || phase === 'rolling') && (
          <Animated.View
            style={[
              styles.combatBorder,
              { opacity: borderOpacity },
            ]}
            pointerEvents="none"
          />
        )}

        {/* Victory gold shimmer border */}
        {phase === 'victory' && (
          <Animated.View
            style={[
              styles.victoryBorder,
              {
                opacity: victoryShimmer.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.4, 0.9, 0.4],
                }),
              },
            ]}
            pointerEvents="none"
          />
        )}

        {/* Defeat darkening overlay */}
        {phase === 'defeat' && (
          <Animated.View
            style={[
              styles.defeatOverlay,
              {
                opacity: defeatDarken.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.6],
                }),
              },
            ]}
            pointerEvents="none"
          />
        )}

        <Animated.View
          style={[
            styles.content,
            { transform: [{ translateY: contentSlide }] },
          ]}
        >
          {/* Combat Header */}
          <View style={styles.header}>
            <Text style={styles.combatTitle}>
              {phase === 'victory'
                ? 'VICTORY!'
                : phase === 'defeat'
                  ? 'DEFEATED'
                  : 'COMBAT'}
            </Text>
          </View>

          {/* Enemy Info */}
          {enemy && phase !== 'victory' && (
            <View style={styles.enemyCard}>
              <View style={styles.enemyHeader}>
                <Text style={styles.enemyIcon}>{'\uD83D\uDC79'}</Text>
                <View style={styles.enemyInfo}>
                  <Text style={styles.enemyName}>{enemy.name}</Text>
                  <View style={styles.enemyHealthRow}>
                    <View
                      style={[
                        styles.healthDot,
                        { backgroundColor: HEALTH_COLORS[enemy.healthEstimate] },
                      ]}
                    />
                    <Text
                      style={[
                        styles.enemyHealth,
                        { color: HEALTH_COLORS[enemy.healthEstimate] },
                      ]}
                    >
                      {enemy.healthEstimate}
                    </Text>
                  </View>
                </View>
              </View>
              {enemy.description && (
                <Text style={styles.enemyDescription}>{enemy.description}</Text>
              )}
            </View>
          )}

          {/* Action Phase: Show action buttons */}
          {phase === 'active' && (
            <View style={styles.actionsContainer}>
              <Text style={styles.actionsPrompt}>Choose your action:</Text>
              <View style={styles.actionsGrid}>
                {(Object.entries(ACTION_CONFIG) as [CombatAction, typeof ACTION_CONFIG[CombatAction]][]).map(
                  ([action, config]) => (
                    <TouchableOpacity
                      key={action}
                      onPress={() => handleAction(action)}
                      activeOpacity={0.7}
                      style={[
                        styles.actionButton,
                        { borderColor: config.color },
                      ]}
                      accessibilityLabel={`${config.label} action`}
                      accessibilityRole="button"
                    >
                      <Text style={styles.actionIcon}>{config.icon}</Text>
                      <Text style={[styles.actionLabel, { color: config.color }]}>
                        {config.label}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>
            </View>
          )}

          {/* Rolling Phase: Show dice roller */}
          {phase === 'rolling' && (
            <View style={styles.diceContainer}>
              <DiceRoller
                diceType={diceType}
                onRollRequested={onRollRequested}
                rollValue={rollValue}
                total={rollTotal}
                success={rollSuccess}
                narration={rollNarration}
                isRolling={isRolling}
                actionLabel="Roll for combat!"
                onDismiss={onDismiss}
              />
            </View>
          )}

          {/* Victory Phase: Show rewards */}
          {phase === 'victory' && (
            <View style={styles.victoryContent}>
              <Text style={styles.victoryIcon}>{'\uD83C\uDFC6'}</Text>
              <Text style={styles.victoryText}>The enemy has been vanquished!</Text>

              {rewards && (
                <View style={styles.rewardsCard}>
                  <Text style={styles.rewardsTitle}>Rewards</Text>
                  {rewards.gold != null && rewards.gold > 0 && (
                    <View style={styles.rewardRow}>
                      <Text style={styles.rewardIcon}>{'\uD83D\uDCB0'}</Text>
                      <Text style={styles.rewardText}>{rewards.gold} gold</Text>
                    </View>
                  )}
                  {rewards.xp != null && rewards.xp > 0 && (
                    <View style={styles.rewardRow}>
                      <Text style={styles.rewardIcon}>{'\u2B50'}</Text>
                      <Text style={styles.rewardText}>{rewards.xp} experience</Text>
                    </View>
                  )}
                  {rewards.items && rewards.items.length > 0 && (
                    rewards.items.map((item, idx) => (
                      <View key={idx} style={styles.rewardRow}>
                        <Text style={styles.rewardIcon}>{'\uD83C\uDF81'}</Text>
                        <Text style={styles.rewardText}>{item}</Text>
                      </View>
                    ))
                  )}
                </View>
              )}

              <TouchableOpacity
                onPress={onDismiss}
                style={styles.continueButton}
                accessibilityLabel="Continue adventure"
                accessibilityRole="button"
              >
                <Text style={styles.continueText}>Continue Adventure</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Defeat Phase: Death save prompt */}
          {phase === 'defeat' && (
            <View style={styles.defeatContent}>
              <Text style={styles.defeatIcon}>{'\uD83D\uDC80'}</Text>
              <Text style={styles.defeatText}>
                Darkness closes in around you...
              </Text>
              <Text style={styles.defeatSubtext}>
                But fate may yet grant you another chance.
              </Text>

              <TouchableOpacity
                onPress={onDeathSave}
                style={styles.deathSaveButton}
                accessibilityLabel="Attempt death save"
                accessibilityRole="button"
              >
                <Text style={styles.deathSaveText}>Death Save</Text>
                <Text style={styles.deathSaveSubtext}>Roll to cheat death</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={onDismiss}
                style={styles.acceptDefeatButton}
                accessibilityLabel="Accept defeat"
                accessibilityRole="button"
              >
                <Text style={styles.acceptDefeatText}>Accept Fate</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(13, 10, 26, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Red pulse border for combat
  combatBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 4,
    borderColor: Colors.danger,
    ...Shadow.glow(Colors.danger),
  },

  // Gold shimmer border for victory
  victoryBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 4,
    borderColor: Colors.gold,
    ...Shadow.glow(Colors.gold),
  },

  // Dark overlay for defeat
  defeatOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },

  content: {
    width: SCREEN_WIDTH - Spacing.xl * 2,
    maxHeight: SCREEN_HEIGHT * 0.8,
    alignItems: 'center',
    padding: Spacing.xl,
  },

  // Header
  header: {
    marginBottom: Spacing.xl,
  },
  combatTitle: {
    color: Colors.danger,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.heavy,
    letterSpacing: 4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(229, 57, 53, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },

  // Enemy card
  enemyCard: {
    width: '100%',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
    ...Shadow.md,
  },
  enemyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  enemyIcon: {
    fontSize: 36,
    marginRight: Spacing.md,
  },
  enemyInfo: {
    flex: 1,
  },
  enemyName: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  enemyHealthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  enemyHealth: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  enemyDescription: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    marginTop: Spacing.md,
    lineHeight: 20,
  },

  // Actions
  actionsContainer: {
    width: '100%',
    alignItems: 'center',
  },
  actionsPrompt: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.lg,
    letterSpacing: 0.5,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.md,
    width: '100%',
  },
  actionButton: {
    width: '46%',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    ...Shadow.sm,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: Spacing.sm,
  },
  actionLabel: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },

  // Dice
  diceContainer: {
    width: '100%',
  },

  // Victory
  victoryContent: {
    alignItems: 'center',
    width: '100%',
  },
  victoryIcon: {
    fontSize: 72,
    marginBottom: Spacing.lg,
  },
  victoryText: {
    color: Colors.gold,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  rewardsCard: {
    width: '100%',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.goldDark,
    marginBottom: Spacing.xl,
  },
  rewardsTitle: {
    color: Colors.gold,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  rewardIcon: {
    fontSize: 18,
  },
  rewardText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  continueButton: {
    backgroundColor: Colors.gold,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    ...Shadow.md,
  },
  continueText: {
    color: Colors.background,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },

  // Defeat
  defeatContent: {
    alignItems: 'center',
    width: '100%',
  },
  defeatIcon: {
    fontSize: 72,
    marginBottom: Spacing.lg,
  },
  defeatText: {
    color: Colors.dangerLight,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  defeatSubtext: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  deathSaveButton: {
    backgroundColor: Colors.danger,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.lg,
    ...Shadow.glow(Colors.danger),
  },
  deathSaveText: {
    color: Colors.white,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  deathSaveSubtext: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
  },
  acceptDefeatButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.textMuted,
  },
  acceptDefeatText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
});
