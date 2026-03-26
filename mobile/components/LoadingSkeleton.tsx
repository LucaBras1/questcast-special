import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../constants/theme';
import { useReducedMotion } from '../hooks/useReducedMotion';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
}

function SkeletonBlock({ width = '100%', height = 16, borderRadius = BorderRadius.sm, style }: SkeletonProps) {
  const reduceMotion = useReducedMotion();
  const shimmer = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    if (reduceMotion) return;
    const animation = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer, reduceMotion]);

  const shimmerTranslateX = shimmer.interpolate({
    inputRange: [-1, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
  });

  return (
    <View
      style={[
        {
          width: width as number | `${number}%`,
          height,
          borderRadius,
          backgroundColor: Colors.backgroundCard,
          overflow: 'hidden',
        },
        style,
      ]}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      {!reduceMotion && (
        <Animated.View
          style={[
            styles.shimmer,
            { transform: [{ translateX: shimmerTranslateX }] },
          ]}
        />
      )}
    </View>
  );
}

/** Skeleton placeholder for a session card on the home screen. */
export function SessionCardSkeleton() {
  return (
    <View style={styles.sessionCard} accessibilityLabel="Loading adventure">
      <View style={styles.sessionCardRow}>
        <SkeletonBlock width={48} height={48} borderRadius={24} />
        <View style={styles.sessionCardContent}>
          <SkeletonBlock width="60%" height={16} />
          <SkeletonBlock width="40%" height={12} style={{ marginTop: Spacing.sm }} />
          <SkeletonBlock width="70%" height={12} style={{ marginTop: Spacing.xs }} />
        </View>
      </View>
    </View>
  );
}

/** Shows 3 skeleton session cards for the initial loading state. */
export function HomeLoadingSkeleton() {
  return (
    <View style={styles.container}>
      <SessionCardSkeleton />
      <SessionCardSkeleton />
      <SessionCardSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SCREEN_WIDTH * 0.4,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  sessionCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  sessionCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  sessionCardContent: {
    flex: 1,
  },
});
