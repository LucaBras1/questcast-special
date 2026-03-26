import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '../constants/theme';

interface HealthBarProps {
  current: number;
  max: number;
  showLabel?: boolean;
  height?: number;
}

export function HealthBar({ current, max, showLabel = true, height = 8 }: HealthBarProps) {
  const percentage = Math.max(0, Math.min(100, (current / max) * 100));

  const getBarColor = () => {
    if (percentage > 60) return Colors.healthGreen;
    if (percentage > 30) return Colors.healthYellow;
    return Colors.healthRed;
  };

  return (
    <View style={styles.container}>
      {showLabel && (
        <Text style={styles.label}>
          HP {current}/{max}
        </Text>
      )}
      <View style={[styles.track, { height }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${percentage}%`,
              backgroundColor: getBarColor(),
              height,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
  },
  track: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.round,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: BorderRadius.round,
  },
});
