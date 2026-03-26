import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  Shadow,
} from '../constants/theme';
import { Button } from '../components/Button';

export default function NotFoundScreen() {
  const router = useRouter();
  const floatAnim = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Float animation for icon
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 10,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Fade in content
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, [floatAnim, fadeIn]);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeIn }]}>
        <Animated.View style={{ transform: [{ translateY: floatAnim }] }}>
          <Text style={styles.icon}>{'\uD83C\uDF0C'}</Text>
        </Animated.View>

        <Text style={styles.title}>Lost in the Void</Text>
        <Text style={styles.subtitle}>
          The path you seek does not exist in this realm.{'\n'}
          Perhaps the ancient maps were wrong, or the trail has faded with time.
        </Text>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{'\u2694\uFE0F'}</Text>
          <View style={styles.dividerLine} />
        </View>

        <Button
          title="Return to the Tavern"
          onPress={() => router.replace('/(main)/home')}
          size="lg"
        />
        <Button
          title="Go Back"
          onPress={() => router.back()}
          variant="ghost"
          style={styles.backButton}
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  icon: {
    fontSize: 80,
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.gold,
    marginBottom: Spacing.md,
    textAlign: 'center',
    ...Shadow.glow(Colors.goldDark),
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.xxl,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
    width: '60%',
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 16,
    marginHorizontal: Spacing.md,
  },
  backButton: {
    marginTop: Spacing.md,
  },
});
