import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Colors, FontSize, FontWeight, Spacing, Shadow } from '../constants/theme';

const { width } = Dimensions.get('window');

interface SplashScreenProps {
  /** Whether the app is ready (fonts loaded, auth checked, etc.) */
  isReady: boolean;
  /** Called when the splash animation has finished fading out */
  onAnimationComplete: () => void;
}

export function SplashScreen({ isReady, onAnimationComplete }: SplashScreenProps) {
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.8)).current;
  const letterGlow = useRef(new Animated.Value(0)).current;
  const orbFloat = useRef(new Animated.Value(0)).current;
  const orbOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const underlineWidth = useRef(new Animated.Value(0)).current;

  // Entrance animation sequence
  useEffect(() => {
    // Crystal ball fades in and floats
    Animated.sequence([
      // Orb appears
      Animated.parallel([
        Animated.timing(orbOpacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
      // Title reveal with glow
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(titleScale, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      // Glow sweep across letters
      Animated.timing(letterGlow, {
        toValue: 1,
        duration: 1000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }),
      // Underline draws
      Animated.timing(underlineWidth, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      // Subtitle appears
      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous floating orb
    Animated.loop(
      Animated.sequence([
        Animated.timing(orbFloat, {
          toValue: -8,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(orbFloat, {
          toValue: 8,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  // Fade out when ready
  useEffect(() => {
    if (isReady) {
      // Small delay to ensure minimum splash display time
      const timer = setTimeout(() => {
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 500,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start(() => {
          onAnimationComplete();
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isReady, containerOpacity, onAnimationComplete]);

  const underlineWidthInterpolated = underlineWidth.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 140],
  });

  return (
    <Animated.View
      style={[styles.container, { opacity: containerOpacity }]}
      accessibilityLabel="Questcast loading"
      accessibilityRole="progressbar"
    >
      {/* Background glow orbs */}
      <View style={styles.backgroundDecor}>
        <Animated.View
          style={[styles.bgOrb, styles.bgOrbTop, { opacity: orbOpacity }]}
        />
        <Animated.View
          style={[styles.bgOrb, styles.bgOrbBottom, { opacity: Animated.multiply(orbOpacity, 0.5) }]}
        />
      </View>

      {/* Crystal ball icon */}
      <Animated.View
        style={[
          styles.orbContainer,
          {
            opacity: orbOpacity,
            transform: [{ translateY: orbFloat }],
          },
        ]}
      >
        <Text style={styles.orbIcon}>{'\uD83D\uDD2E'}</Text>
      </Animated.View>

      {/* QUESTCAST title */}
      <Animated.View
        style={[
          styles.titleContainer,
          {
            opacity: titleOpacity,
            transform: [{ scale: titleScale }],
          },
        ]}
      >
        <Text style={styles.title}>QUESTCAST</Text>
      </Animated.View>

      {/* Animated underline */}
      <View style={styles.underlineContainer}>
        <Animated.View
          style={[
            styles.underline,
            { width: underlineWidthInterpolated },
          ]}
        />
      </View>

      {/* Subtitle */}
      <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
        Your AI Dungeon Master
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  backgroundDecor: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  bgOrb: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  bgOrbTop: {
    top: -80,
    right: -80,
    backgroundColor: Colors.purpleDark,
  },
  bgOrbBottom: {
    bottom: -60,
    left: -80,
    backgroundColor: Colors.goldDark,
  },
  orbContainer: {
    marginBottom: Spacing.xl,
  },
  orbIcon: {
    fontSize: 64,
  },
  titleContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: FontSize.title,
    fontWeight: FontWeight.heavy,
    color: Colors.gold,
    letterSpacing: 8,
    textAlign: 'center',
    ...Shadow.glow(Colors.gold),
  },
  underlineContainer: {
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  underline: {
    height: 2,
    backgroundColor: Colors.gold,
    opacity: 0.6,
  },
  subtitle: {
    fontSize: FontSize.lg,
    color: Colors.textSecondary,
    letterSpacing: 2,
  },
});
