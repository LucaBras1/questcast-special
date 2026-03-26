import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../constants/theme';

// ============================================
// Connection Status Indicator
// Shown in the game session header
// ============================================

interface ConnectionStatusProps {
  /** Whether SSE stream is actively connected */
  isConnected: boolean;
  /** Whether reconnection is in progress */
  isReconnecting: boolean;
  /** Called when user taps on a disconnected indicator */
  onReconnect?: () => void;
}

type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

const STATE_CONFIG: Record<ConnectionState, { color: string; label: string }> = {
  connected: { color: Colors.success, label: 'Connected' },
  reconnecting: { color: Colors.warning, label: 'Reconnecting...' },
  disconnected: { color: Colors.error, label: 'Disconnected' },
};

export function ConnectionStatus({
  isConnected,
  isReconnecting,
  onReconnect,
}: ConnectionStatusProps) {
  const state: ConnectionState = isConnected
    ? 'connected'
    : isReconnecting
      ? 'reconnecting'
      : 'disconnected';

  const config = STATE_CONFIG[state];

  const content = (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: config.color }]} />
      {state !== 'connected' && (
        <Text style={[styles.label, { color: config.color }]}>
          {config.label}
          {state === 'disconnected' ? ' - Tap to retry' : ''}
        </Text>
      )}
    </View>
  );

  if (state === 'disconnected' && onReconnect) {
    return (
      <TouchableOpacity
        onPress={onReconnect}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Connection lost. Tap to reconnect."
        accessibilityRole="button"
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginLeft: Spacing.xs,
  },
});
