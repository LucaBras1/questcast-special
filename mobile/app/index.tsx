import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing, Shadow } from '../constants/theme';
import { Button } from '../components/Button';
import { useReducedMotion } from '../hooks/useReducedMotion';

const { width } = Dimensions.get('window');

export default function WelcomeScreen() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  // Animations
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(-30)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;
  const buttonTranslateY = useRef(new Animated.Value(30)).current;
  const glowPulse = useRef(new Animated.Value(0.3)).current;
  const orbFloat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      // Show everything immediately, no looping animations
      titleOpacity.setValue(1);
      titleTranslateY.setValue(0);
      subtitleOpacity.setValue(1);
      buttonOpacity.setValue(1);
      buttonTranslateY.setValue(0);
      glowPulse.setValue(0.5);
      orbFloat.setValue(0);
      return;
    }

    // Entrance animations
    Animated.sequence([
      // Title fades in
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 800,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
      // Subtitle appears
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      // Button slides up
      Animated.parallel([
        Animated.timing(buttonOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(buttonTranslateY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Continuous glow pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 0.8,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.3,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Floating orb animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbFloat, {
          toValue: -10,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(orbFloat, {
          toValue: 10,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGetStarted = () => {
    router.push('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Decorative background elements */}
      <View style={styles.backgroundDecor}>
        <Animated.View
          style={[
            styles.glowOrb,
            styles.glowOrbTop,
            { opacity: glowPulse, transform: [{ translateY: orbFloat }] },
          ]}
        />
        <Animated.View
          style={[
            styles.glowOrb,
            styles.glowOrbBottom,
            {
              opacity: Animated.multiply(glowPulse, 0.6),
              transform: [
                {
                  translateY: Animated.multiply(orbFloat, -1),
                },
              ],
            },
          ]}
        />
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Crystal ball icon */}
        <Animated.View style={[styles.iconContainer, { transform: [{ translateY: orbFloat }] }]}>
          <Text style={styles.heroIcon}>{'🔮'}</Text>
        </Animated.View>

        {/* Title */}
        <Animated.View
          style={[
            styles.titleContainer,
            {
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslateY }],
            },
          ]}
        >
          <Text style={styles.title}>QUESTCAST</Text>
          <View style={styles.titleUnderline} />
        </Animated.View>

        {/* Subtitle */}
        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
          Your AI Dungeon Master{'\n'}in Your Pocket
        </Animated.Text>

        {/* Decorative divider */}
        <Animated.View style={[styles.dividerContainer, { opacity: subtitleOpacity }]}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerIcon}>{'⚔️'}</Text>
          <View style={styles.dividerLine} />
        </Animated.View>

        {/* Tagline */}
        <Animated.Text style={[styles.tagline, { opacity: subtitleOpacity }]}>
          Embark on voice-driven adventures{'\n'}crafted by artificial intelligence
        </Animated.Text>
      </View>

      {/* Bottom section */}
      <Animated.View
        style={[
          styles.bottomSection,
          {
            opacity: buttonOpacity,
            transform: [{ translateY: buttonTranslateY }],
          },
        ]}
      >
        <Button
          title="Begin Your Quest"
          onPress={handleGetStarted}
          size="lg"
          fullWidth
        />
        <Text style={styles.versionText}>v0.1.0 Alpha</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backgroundDecor: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  glowOrb: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: Colors.purpleDark,
  },
  glowOrbTop: {
    top: -100,
    right: -100,
  },
  glowOrbBottom: {
    bottom: -50,
    left: -100,
    backgroundColor: Colors.goldDark,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  heroIcon: {
    fontSize: 72,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.heavy,
    color: Colors.gold,
    letterSpacing: 8,
    textAlign: 'center',
    ...Shadow.glow(Colors.gold),
  },
  titleUnderline: {
    width: 120,
    height: 2,
    backgroundColor: Colors.gold,
    marginTop: Spacing.sm,
    opacity: 0.6,
  },
  subtitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.medium,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: Spacing.xl,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    width: width * 0.6,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  dividerIcon: {
    fontSize: 20,
    marginHorizontal: Spacing.md,
  },
  tagline: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  bottomSection: {
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.xxl,
  },
  versionText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
    letterSpacing: 1,
  },
});
