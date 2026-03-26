import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
} from '../../constants/theme';
import { Button } from '../../components/Button';
import { DiceRoller } from '../../components/DiceRoller';
import { A11yLabels, A11yHints } from '../../utils/accessibility';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useAuthStore } from '../../stores/authStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TUTORIAL_COMPLETED_KEY = 'questcast_tutorial_completed';

// ============================================
// Tutorial Beat Types
// ============================================

interface TutorialBeat {
  id: number;
  title: { en: string; cs: string };
  instruction: { en: string; cs: string };
  narration: { en: string; cs: string };
  teaches: { en: string; cs: string };
  highlightElement: 'narrator' | 'mic' | 'choices' | 'dice' | 'continue';
  choices?: { en: string[]; cs: string[] };
  requiresDiceRoll?: boolean;
}

const TUTORIAL_BEATS: TutorialBeat[] = [
  {
    id: 1,
    title: { en: 'Listen to the Story', cs: 'Poslouchejte pribeh' },
    instruction: {
      en: 'The AI Dungeon Master narrates your adventure. Listen carefully.',
      cs: 'AI Dungeon Master vypravuje vas pribeh. Pozorne poslouchejte.',
    },
    narration: {
      en: 'Your eyes snap open. The air is thick with smoke and old ale. You are sitting in the dark corner of a tavern you have never seen before. Across the table, a cloaked figure watches you. Candlelight catches their eyes. So, you are awake, a quiet voice says. Interesting. Tell me, what do they call you?',
      cs: 'Otvirate oci. Vzduch je tezky, prosyceny kourem a starym pivem. Sedite v temnem rohu hospody, kterou jste nikdy predtim nevideli. Naproti vam sedi postava zahalena v plasti. Jeji oci se lesknou ve svetle svicek. Tak vy jste se probudili, rika tichy hlas. Zajimave. Reknete mi, jak vam rikaji?',
    },
    teaches: { en: 'listening', cs: 'poslech' },
    highlightElement: 'narrator',
  },
  {
    id: 2,
    title: { en: 'Speak to Interact', cs: 'Mluvte a ovladejte' },
    instruction: {
      en: 'Tap the crystal orb and speak your name. The AI understands your voice.',
      cs: 'Klepnete na krystalovou kouli a reknete sve jmeno. AI rozumi vasemu hlasu.',
    },
    narration: {
      en: 'The figure nods slowly. A good name, they say. Then their expression hardens. Listen carefully. Something is coming through those doors, and it is looking for you. A crash echoes from outside, followed by shouting. We can slip out the back into the darkness. Or we stay and face whatever comes.',
      cs: 'Postava prikyvne. Dobre jmeno, rika. Pak zvazni. Poslouchejte. Za temi dvermi se blizi neco, co vas hleda. Zvenku se ozve krik a zvuk prevraceneho stolu. Muzeme proklouznout zadnimi dvermi do tmy. Nebo zustat a celit tomu celem.',
    },
    teaches: { en: 'voice interaction', cs: 'hlasove ovladani' },
    highlightElement: 'mic',
    choices: {
      en: ['Slip out the back', 'Stay and face it'],
      cs: ['Proklouznout zadnimi dvermi', 'Zustat a celit nebezpeci'],
    },
  },
  {
    id: 3,
    title: { en: 'Make Your Choice', cs: 'Ucinete rozhodnuti' },
    instruction: {
      en: 'Choose your path. Every decision shapes your story.',
      cs: 'Zvolte svou cestu. Kazde rozhodnuti formuje vas pribeh.',
    },
    narration: {
      en: 'You bolt for the back door. Cold night air hits your face. A narrow alley stretches between stone walls, but an overturned cart blocks the way. The only path forward is over it. That will take some agility. Roll the dice!',
      cs: 'Vyrazite ke dverim. Studeny nocni vzduch vas ovanemrazivym dechem. Temna ulicka se vine mezi kamennymi zdmi. Ale cesta je zahrazena prevracenym vozem. Jediny zpusob dal vede pres nej. Bude to chtit obratnost. Hodte kostkou!',
    },
    teaches: { en: 'making decisions', cs: 'rozhodovani' },
    highlightElement: 'choices',
  },
  {
    id: 4,
    title: { en: 'Roll the Dice', cs: 'Hodte kostkou' },
    instruction: {
      en: 'Tap to roll. The dice determine your fate in challenges.',
      cs: 'Klepnete pro hod. Kostky urci vas osud ve vyzve.',
    },
    narration: {
      en: 'You vault over the cart with surprising grace. On the wall beyond it, something catches your eye. A strange symbol carved into the stone, its lines faintly glowing. You have never seen anything like it, yet it feels oddly familiar.',
      cs: 'Preskocite vuz s lehkosti, o ktere jste ani netusili. Za nim na zdi zahlednete podivny symbol vytesany do kamene. Zarive linie tvori obrazec, ktery jste jeste nikdy nevideli. Neco vam rika, ze tohle neni nahoda.',
    },
    teaches: { en: 'dice rolling', cs: 'hod kostkou' },
    highlightElement: 'dice',
    requiresDiceRoll: true,
  },
  {
    id: 5,
    title: { en: 'Your Adventure Continues', cs: 'Vase dobrodruzstvi pokracuje' },
    instruction: {
      en: 'Your progress saves automatically. Come back anytime to continue.',
      cs: 'Vas postup se automaticky uklada. Vraitte se kdykoliv a pokracujte.',
    },
    narration: {
      en: 'That symbol. You have seen it before, not in a place but in a feeling. Something ancient is stirring. The cloaked figure\'s voice comes one last time, now just a whisper on the wind. This was only the beginning. When you return, the world will be waiting.',
      cs: 'Ten symbol. Videli jste ho uz nekde. A pak si vzpomenete, ne na konkretni misto, ale na pocit. Neco prastarého se probouzi. Hlas zahalene postavy se ozve naposledy, tentokrat jako sepy vetru. Tohle byl jen zacatek. Az se vratite, svet na vas bude cekat.',
    },
    teaches: { en: 'story continues', cs: 'pribeh pokracuje' },
    highlightElement: 'continue',
  },
];

// ============================================
// Tutorial Helper: Check if new user
// ============================================

export async function isTutorialCompleted(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(TUTORIAL_COMPLETED_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function markTutorialCompleted(): Promise<void> {
  try {
    await AsyncStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
  } catch {
    // Non-critical
  }
}

export async function resetTutorialCompleted(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TUTORIAL_COMPLETED_KEY);
  } catch {
    // Non-critical
  }
}

// ============================================
// Tutorial Screen
// ============================================

export default function TutorialScreen() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const language = useAuthStore((s) => s.user?.language) ?? 'en';
  const lang = language === 'cs' ? 'cs' : 'en';

  const [currentBeat, setCurrentBeat] = useState(0);
  const [showInstruction, setShowInstruction] = useState(true);
  const [diceRolled, setDiceRolled] = useState(false);
  const [choiceMade, setChoiceMade] = useState(false);
  const [micPulsing, setMicPulsing] = useState(false);

  // Animations
  const narrationOpacity = useRef(new Animated.Value(0)).current;
  const narrationTranslateY = useRef(new Animated.Value(20)).current;
  const instructionOpacity = useRef(new Animated.Value(0)).current;
  const instructionScale = useRef(new Animated.Value(0.9)).current;
  const highlightPulse = useRef(new Animated.Value(0)).current;
  const micPulseAnim = useRef(new Animated.Value(1)).current;
  const progressWidth = useRef(new Animated.Value(0)).current;

  const beat = TUTORIAL_BEATS[currentBeat];

  // Animate beat entrance
  useEffect(() => {
    setShowInstruction(true);
    setDiceRolled(false);
    setChoiceMade(false);
    setMicPulsing(beat.highlightElement === 'mic');

    if (reduceMotion) {
      // Skip animations, show everything immediately
      narrationOpacity.setValue(1);
      narrationTranslateY.setValue(0);
      instructionOpacity.setValue(1);
      instructionScale.setValue(1);
      highlightPulse.setValue(1);
      progressWidth.setValue((currentBeat + 1) / TUTORIAL_BEATS.length);
      return;
    }

    narrationOpacity.setValue(0);
    narrationTranslateY.setValue(20);
    instructionOpacity.setValue(0);
    instructionScale.setValue(0.9);

    // Progress bar animation
    Animated.timing(progressWidth, {
      toValue: (currentBeat + 1) / TUTORIAL_BEATS.length,
      duration: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();

    // Narration fades in
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(narrationOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(narrationTranslateY, {
          toValue: 0,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(800),
      // Instruction overlay appears
      Animated.parallel([
        Animated.timing(instructionOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(instructionScale, {
          toValue: 1,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Highlight pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(highlightPulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(highlightPulse, {
          toValue: 0.3,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [currentBeat, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pulsing mic animation
  useEffect(() => {
    if (micPulsing && !reduceMotion) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micPulseAnim, {
            toValue: 1.15,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(micPulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      micPulseAnim.setValue(1);
    }
  }, [micPulsing, micPulseAnim, reduceMotion]);

  const handleDismissInstruction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.timing(instructionOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowInstruction(false));
  }, [instructionOpacity]);

  const handleAdvanceBeat = useCallback(() => {
    if (currentBeat < TUTORIAL_BEATS.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCurrentBeat((prev) => prev + 1);
    }
  }, [currentBeat]);

  const handleChoice = useCallback(
    (_choice: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setChoiceMade(true);
      // Auto-advance after choice
      setTimeout(() => handleAdvanceBeat(), 1000);
    },
    [handleAdvanceBeat],
  );

  const handleDiceRoll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setDiceRolled(true);
    // Auto-advance after dice animation
    setTimeout(() => handleAdvanceBeat(), 2000);
  }, [handleAdvanceBeat]);

  const handleMicTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMicPulsing(false);
    // Simulate voice interaction, advance
    setTimeout(() => handleAdvanceBeat(), 800);
  }, [handleAdvanceBeat]);

  const handleSkip = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markTutorialCompleted();
    router.replace('/(main)/new-game');
  }, [router]);

  const handleComplete = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await markTutorialCompleted();
    router.replace('/(main)/new-game');
  }, [router]);

  const progressWidthInterpolated = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <Animated.View
          style={[
            styles.progressBarFill,
            { width: progressWidthInterpolated },
          ]}
        />
      </View>

      {/* Header with skip */}
      <View style={styles.header}>
        <Text style={styles.beatCounter}>
          {currentBeat + 1} / {TUTORIAL_BEATS.length}
        </Text>
        <TouchableOpacity
          onPress={handleSkip}
          style={styles.skipButton}
          accessibilityLabel={A11yLabels.skipTutorial}
          accessibilityRole="button"
          accessibilityHint={A11yHints.tutorialSkip}
        >
          <Text style={styles.skipText}>
            {lang === 'cs' ? 'Preskocit' : 'Skip Tutorial'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Narration area */}
      <View style={styles.narrationArea}>
        <Animated.View
          style={[
            styles.narrationCard,
            {
              opacity: narrationOpacity,
              transform: [{ translateY: narrationTranslateY }],
            },
          ]}
        >
          <View style={styles.narratorHeader}>
            <Text style={styles.narratorIcon}>{'\uD83C\uDFAD'}</Text>
            <Text style={styles.narratorLabel}>Dungeon Master</Text>
          </View>
          <Text style={styles.narrationText}>{beat.narration[lang]}</Text>
        </Animated.View>
      </View>

      {/* Instruction overlay */}
      {showInstruction && (
        <Animated.View
          style={[
            styles.instructionOverlay,
            {
              opacity: instructionOpacity,
              transform: [{ scale: instructionScale }],
            },
          ]}
        >
          <View style={styles.instructionCard}>
            <Animated.View
              style={[styles.instructionBadge, { opacity: highlightPulse }]}
            >
              <Text style={styles.instructionBadgeText}>{beat.teaches[lang].toUpperCase()}</Text>
            </Animated.View>
            <Text style={styles.instructionTitle}>{beat.title[lang]}</Text>
            <Text style={styles.instructionText}>{beat.instruction[lang]}</Text>
            <TouchableOpacity
              onPress={handleDismissInstruction}
              style={styles.gotItButton}
              accessibilityLabel={A11yLabels.gotIt}
              accessibilityRole="button"
            >
              <Text style={styles.gotItText}>{lang === 'cs' ? 'Rozumim!' : 'Got it!'}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Interactive area based on current beat */}
      <View style={styles.interactiveArea}>
        {/* Beat 2: Pulsing mic prompt */}
        {beat.highlightElement === 'mic' && !showInstruction && (
          <Animated.View style={{ transform: [{ scale: micPulseAnim }] }}>
            <TouchableOpacity
              onPress={handleMicTap}
              style={styles.tutorialMicButton}
              accessibilityLabel={A11yLabels.startRecording}
              accessibilityRole="button"
              accessibilityHint={A11yHints.micButton}
            >
              <Text style={styles.micIcon}>{'\uD83D\uDD2E'}</Text>
            </TouchableOpacity>
            <Text style={styles.micHint}>
              {lang === 'cs' ? 'Klepnete na kouli a mluvte' : 'Tap the orb to speak'}
            </Text>
          </Animated.View>
        )}

        {/* Beat 3: Choice buttons */}
        {beat.highlightElement === 'choices' && beat.choices && !showInstruction && (
          <View style={styles.choicesContainer}>
            {beat.choices[lang].map((choice, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => handleChoice(choice)}
                disabled={choiceMade}
                style={[
                  styles.choiceButton,
                  choiceMade && styles.choiceButtonDisabled,
                ]}
                accessibilityLabel={`Choose: ${choice}`}
                accessibilityRole="button"
              >
                <Text style={styles.choiceText}>{choice}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Beat 4: Dice roller */}
        {beat.highlightElement === 'dice' && !showInstruction && (
          <View style={styles.diceContainer}>
            {!diceRolled ? (
              <TouchableOpacity
                onPress={handleDiceRoll}
                style={styles.diceButton}
                accessibilityLabel={A11yLabels.rollDice}
                accessibilityRole="button"
                accessibilityHint={A11yHints.diceRoll}
              >
                <Text style={styles.diceIcon}>{'\uD83C\uDFB2'}</Text>
                <Text style={styles.diceText}>{lang === 'cs' ? 'Hod d20!' : 'Roll d20!'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.diceResult}>
                <Text style={styles.diceResultNumber}>17</Text>
                <Text style={styles.diceResultLabel}>{lang === 'cs' ? 'Uspech!' : 'Success!'}</Text>
              </View>
            )}
          </View>
        )}

        {/* Beat 1 / narrator-only: simple advance button */}
        {beat.highlightElement === 'narrator' && !showInstruction && (
          <TouchableOpacity
            onPress={handleAdvanceBeat}
            style={styles.continueButton}
            accessibilityLabel={A11yLabels.nextStep}
            accessibilityRole="button"
          >
            <Text style={styles.continueText}>{lang === 'cs' ? 'Pokracovat' : 'Continue'}</Text>
          </TouchableOpacity>
        )}

        {/* Beat 5: Completion */}
        {beat.highlightElement === 'continue' && !showInstruction && (
          <View style={styles.completionContainer}>
            <Text style={styles.completionIcon}>{'\u2728'}</Text>
            <Text style={styles.completionTitle}>
              {lang === 'cs' ? 'Tutorial dokoncen!' : 'Tutorial Complete!'}
            </Text>
            <Text style={styles.completionSubtitle}>
              {lang === 'cs'
                ? 'Jste pripraveni vytvorit sveho prvniho hrdinu.'
                : 'You are ready to create your first hero.'}
            </Text>
            <Button
              title={lang === 'cs' ? 'Pokracovat k tvorbe postavy' : 'Continue to Character Creation'}
              onPress={handleComplete}
              size="lg"
              fullWidth
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Progress bar
  progressBarContainer: {
    height: 3,
    backgroundColor: Colors.backgroundCard,
  },
  progressBarFill: {
    height: 3,
    backgroundColor: Colors.gold,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  beatCounter: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    fontVariant: ['tabular-nums'],
  },
  skipButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface,
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  // Narration
  narrationArea: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  narrationCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    borderLeftWidth: 3,
    borderLeftColor: Colors.gold,
    ...Shadow.md,
  },
  narratorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  narratorIcon: {
    fontSize: 16,
    marginRight: Spacing.sm,
  },
  narratorLabel: {
    color: Colors.goldMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  narrationText: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    lineHeight: 24,
    fontStyle: 'italic',
  },

  // Instruction overlay
  instructionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 10, 26, 0.85)',
    zIndex: 10,
    paddingHorizontal: Spacing.xxl,
  },
  instructionCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xxl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gold,
    ...Shadow.lg,
    ...Shadow.glow(Colors.goldDark),
    maxWidth: SCREEN_WIDTH - Spacing.xxl * 2,
    width: '100%',
  },
  instructionBadge: {
    backgroundColor: Colors.goldDark,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.md,
  },
  instructionBadgeText: {
    color: Colors.background,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  instructionTitle: {
    color: Colors.gold,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  instructionText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  gotItButton: {
    backgroundColor: Colors.gold,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.sm,
  },
  gotItText: {
    color: Colors.background,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },

  // Interactive area
  interactiveArea: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
  },

  // Mic button (tutorial)
  tutorialMicButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.micIdle,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.gold,
    ...Shadow.lg,
    ...Shadow.glow(Colors.gold),
    alignSelf: 'center',
  },
  micIcon: {
    fontSize: 32,
  },
  micHint: {
    color: Colors.gold,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.md,
    fontWeight: FontWeight.medium,
  },

  // Choices
  choicesContainer: {
    width: '100%',
    gap: Spacing.md,
  },
  choiceButton: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.goldDark,
    ...Shadow.sm,
    minHeight: 48,
    justifyContent: 'center',
  },
  choiceButtonDisabled: {
    opacity: 0.5,
  },
  choiceText: {
    color: Colors.gold,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },

  // Dice
  diceContainer: {
    alignItems: 'center',
  },
  diceButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.backgroundCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Colors.gold,
    ...Shadow.lg,
    ...Shadow.glow(Colors.goldDark),
  },
  diceIcon: {
    fontSize: 40,
    marginBottom: Spacing.xs,
  },
  diceText: {
    color: Colors.gold,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  diceResult: {
    alignItems: 'center',
  },
  diceResultNumber: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.heavy,
    color: Colors.gold,
    ...Shadow.glow(Colors.gold),
  },
  diceResultLabel: {
    color: Colors.success,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginTop: Spacing.sm,
  },

  // Continue button
  continueButton: {
    backgroundColor: Colors.gold,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.lg,
    minWidth: 48,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadow.md,
  },
  continueText: {
    color: Colors.background,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },

  // Completion
  completionContainer: {
    alignItems: 'center',
    width: '100%',
    gap: Spacing.md,
  },
  completionIcon: {
    fontSize: 48,
  },
  completionTitle: {
    color: Colors.gold,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    textAlign: 'center',
  },
  completionSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
});
