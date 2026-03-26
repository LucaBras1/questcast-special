import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
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
import type { DiceType } from '../hooks/useDiceRoll';

// ============================================
// DiceRoller Component
// Animated d4-d20 dice roll with haptic feedback
// ============================================

interface DiceRollerProps {
  /** The dice type to display/roll */
  diceType?: DiceType;
  /** Called when the user taps "Roll" -- parent triggers API, then passes result back */
  onRollRequested?: (diceType: DiceType) => void;
  /** The final roll value (triggers landing animation when set) */
  rollValue?: number | null;
  /** Total after modifiers */
  total?: number | null;
  /** Whether the roll succeeded */
  success?: boolean | null;
  /** Narration text after roll */
  narration?: string | null;
  /** Whether the backend is processing the roll */
  isRolling?: boolean;
  /** Action description, e.g. "Roll for initiative!" */
  actionLabel?: string;
  /** Compact mode for inline use */
  compact?: boolean;
  /** Called when user dismisses the result */
  onDismiss?: () => void;
}

const DICE_MAX: Record<DiceType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
};

const DICE_SHAPES: Record<DiceType, string> = {
  d4: '\u25B3',   // triangle
  d6: '\u25A0',   // square
  d8: '\u25C6',   // diamond
  d10: '\u2B23',  // pentagon-ish
  d12: '\u2B22',  // hexagon-ish
  d20: '\u2B21',  // large polygon
};

function getDiceResultColor(value: number, max: number, success: boolean | null): string {
  if (value === max) return Colors.gold;       // Nat max (nat 20 on d20)
  if (value === 1) return '#8B0000';           // Nat 1 -- dark red
  if (success === true) return Colors.healthGreen;
  if (success === false) return Colors.healthRed;
  return Colors.textPrimary;
}

export function DiceRoller({
  diceType = 'd20',
  onRollRequested,
  rollValue,
  total,
  success,
  narration,
  isRolling = false,
  actionLabel,
  compact = false,
  onDismiss,
}: DiceRollerProps) {
  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  const [hasLanded, setHasLanded] = useState(false);

  // Animations
  const diceScale = useRef(new Animated.Value(1)).current;
  const diceRotation = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const flashIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const max = DICE_MAX[diceType];

  // Random number flash during roll
  useEffect(() => {
    if (isRolling && !rollValue) {
      // Start flashing random numbers
      flashIntervalRef.current = setInterval(() => {
        setDisplayNumber(Math.floor(Math.random() * max) + 1);
      }, 80);

      // Tumble animation
      Animated.loop(
        Animated.timing(diceRotation, {
          toValue: 1,
          duration: 600,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(diceScale, {
            toValue: 1.15,
            duration: 200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(diceScale, {
            toValue: 0.9,
            duration: 200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();

      return () => {
        if (flashIntervalRef.current) {
          clearInterval(flashIntervalRef.current);
          flashIntervalRef.current = null;
        }
      };
    } else if (rollValue && !hasLanded) {
      // Stop flashing
      if (flashIntervalRef.current) {
        clearInterval(flashIntervalRef.current);
        flashIntervalRef.current = null;
      }

      setDisplayNumber(rollValue);
      setHasLanded(true);

      // Stop rotation
      diceRotation.stopAnimation();
      diceScale.stopAnimation();
      diceRotation.setValue(0);

      // Bounce landing
      Animated.sequence([
        Animated.timing(diceScale, {
          toValue: 1.3,
          duration: 150,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(diceScale, {
          toValue: 1,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Glow for nat 20 / nat 1
      if (rollValue === max || rollValue === 1) {
        Animated.loop(
          Animated.sequence([
            Animated.timing(glowOpacity, {
              toValue: 1,
              duration: 600,
              useNativeDriver: true,
            }),
            Animated.timing(glowOpacity, {
              toValue: 0.3,
              duration: 600,
              useNativeDriver: true,
            }),
          ]),
        ).start();
      }

      // Result text fade in
      Animated.timing(resultOpacity, {
        toValue: 1,
        duration: 400,
        delay: 300,
        useNativeDriver: true,
      }).start();

      // Haptic feedback
      if (rollValue === max) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (rollValue === 1) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      }
    }
  }, [isRolling, rollValue, hasLanded, max, diceRotation, diceScale, glowOpacity, resultOpacity]);

  // Reset when dice type or action changes
  useEffect(() => {
    if (!rollValue && !isRolling) {
      setDisplayNumber(null);
      setHasLanded(false);
      diceScale.setValue(1);
      diceRotation.setValue(0);
      resultOpacity.setValue(0);
      glowOpacity.setValue(0);
    }
  }, [diceType, rollValue, isRolling, diceScale, diceRotation, resultOpacity, glowOpacity]);

  const handleRollPress = useCallback(() => {
    if (isRolling || hasLanded) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRollRequested?.(diceType);
  }, [isRolling, hasLanded, diceType, onRollRequested]);

  const spin = diceRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const resultColor = rollValue
    ? getDiceResultColor(rollValue, max, success ?? null)
    : Colors.textPrimary;

  const isNatMax = rollValue === max;
  const isNat1 = rollValue === 1;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactRow}>
          <View style={[styles.compactDice, hasLanded && { borderColor: resultColor }]}>
            <Text style={[styles.compactDiceNumber, hasLanded && { color: resultColor }]}>
              {displayNumber ?? '?'}
            </Text>
            <Text style={styles.compactDiceLabel}>{diceType}</Text>
          </View>
          {!hasLanded && !isRolling && (
            <TouchableOpacity
              onPress={handleRollPress}
              style={styles.compactRollBtn}
              accessibilityLabel={`Roll ${diceType}`}
              accessibilityRole="button"
            >
              <Text style={styles.compactRollText}>Roll</Text>
            </TouchableOpacity>
          )}
          {hasLanded && total != null && (
            <View style={styles.compactResult}>
              <Text style={[styles.compactTotal, { color: resultColor }]}>
                {total}
              </Text>
              <Text style={[styles.compactSuccessLabel, { color: resultColor }]}>
                {isNatMax ? 'CRITICAL!' : isNat1 ? 'FUMBLE!' : success ? 'Success' : 'Failure'}
              </Text>
            </View>
          )}
        </View>
        {hasLanded && narration && (
          <Text style={styles.compactNarration} numberOfLines={2}>{narration}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Action label */}
      {actionLabel && (
        <Text style={styles.actionLabel}>{actionLabel}</Text>
      )}

      {/* Dice display */}
      <View style={styles.diceArea}>
        {/* Glow ring for nat 20 / nat 1 */}
        {hasLanded && (isNatMax || isNat1) && (
          <Animated.View
            style={[
              styles.glowRing,
              {
                opacity: glowOpacity,
                borderColor: resultColor,
                shadowColor: resultColor,
              },
            ]}
          />
        )}

        <Animated.View
          style={[
            styles.diceBody,
            {
              transform: [
                { scale: diceScale },
                { rotate: isRolling && !hasLanded ? spin : '0deg' },
              ],
            },
            hasLanded && {
              borderColor: resultColor,
              ...Shadow.glow(resultColor),
            },
          ]}
        >
          <Text style={styles.diceShape}>{DICE_SHAPES[diceType]}</Text>
          <Text
            style={[
              styles.diceNumber,
              hasLanded && { color: resultColor },
            ]}
          >
            {displayNumber ?? '?'}
          </Text>
          <Text style={styles.diceLabel}>{diceType.toUpperCase()}</Text>
        </Animated.View>
      </View>

      {/* Roll button or result */}
      {!hasLanded ? (
        <TouchableOpacity
          onPress={handleRollPress}
          disabled={isRolling}
          style={[styles.rollButton, isRolling && styles.rollButtonDisabled]}
          accessibilityLabel={`Roll ${diceType}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: isRolling }}
        >
          <Text style={styles.rollButtonText}>
            {isRolling ? 'Rolling...' : `Roll ${diceType.toUpperCase()}`}
          </Text>
        </TouchableOpacity>
      ) : (
        <Animated.View style={[styles.resultArea, { opacity: resultOpacity }]}>
          {/* Result summary */}
          <View style={styles.resultRow}>
            <Text style={[styles.resultValue, { color: resultColor }]}>
              {rollValue}
            </Text>
            {total != null && total !== rollValue && (
              <Text style={styles.resultModifier}>
                {' '}= {total} (with modifiers)
              </Text>
            )}
          </View>

          <Text style={[styles.resultLabel, { color: resultColor }]}>
            {isNatMax
              ? (diceType === 'd20' ? 'NATURAL 20!' : 'CRITICAL HIT!')
              : isNat1
                ? 'CRITICAL FAILURE!'
                : success
                  ? 'SUCCESS!'
                  : 'FAILURE'}
          </Text>

          {/* Narration */}
          {narration && (
            <View style={styles.narrationBox}>
              <Text style={styles.narrationIcon}>{'🎭'}</Text>
              <Text style={styles.narrationText}>{narration}</Text>
            </View>
          )}

          {/* Dismiss */}
          {onDismiss && (
            <TouchableOpacity
              onPress={onDismiss}
              style={styles.dismissButton}
              accessibilityLabel="Continue"
              accessibilityRole="button"
            >
              <Text style={styles.dismissText}>Continue</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const DICE_SIZE = 120;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.md,
  },
  actionLabel: {
    color: Colors.gold,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    letterSpacing: 0.5,
  },

  // Dice
  diceArea: {
    width: DICE_SIZE + 40,
    height: DICE_SIZE + 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  glowRing: {
    position: 'absolute',
    width: DICE_SIZE + 30,
    height: DICE_SIZE + 30,
    borderRadius: (DICE_SIZE + 30) / 2,
    borderWidth: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  diceBody: {
    width: DICE_SIZE,
    height: DICE_SIZE,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 3,
    borderColor: Colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.lg,
  },
  diceShape: {
    position: 'absolute',
    top: 4,
    right: 8,
    fontSize: 14,
    color: Colors.textMuted,
    opacity: 0.5,
  },
  diceNumber: {
    fontSize: 42,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  diceLabel: {
    position: 'absolute',
    bottom: 8,
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },

  // Roll button
  rollButton: {
    backgroundColor: Colors.gold,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    minWidth: 180,
    alignItems: 'center',
    ...Shadow.md,
  },
  rollButtonDisabled: {
    opacity: 0.6,
  },
  rollButtonText: {
    color: Colors.background,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },

  // Result
  resultArea: {
    alignItems: 'center',
    width: '100%',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: Spacing.xs,
  },
  resultValue: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.heavy,
  },
  resultModifier: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
  resultLabel: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    letterSpacing: 2,
    marginBottom: Spacing.lg,
  },
  narrationBox: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    width: '100%',
    marginBottom: Spacing.lg,
  },
  narrationIcon: {
    fontSize: 16,
    marginRight: Spacing.sm,
    marginTop: 2,
  },
  narrationText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  dismissButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.goldDark,
  },
  dismissText: {
    color: Colors.gold,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },

  // Compact mode
  compactContainer: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  compactDice: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactDiceNumber: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  compactDiceLabel: {
    position: 'absolute',
    bottom: 2,
    fontSize: 8,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
  },
  compactRollBtn: {
    backgroundColor: Colors.gold,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  compactRollText: {
    color: Colors.background,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  compactResult: {
    flex: 1,
    alignItems: 'flex-start',
  },
  compactTotal: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.heavy,
  },
  compactSuccessLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  compactNarration: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
});
