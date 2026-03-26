import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Colors,
  FontSize,
  FontWeight,
  BorderRadius,
  Spacing,
  Shadow,
  CLASS_ICONS,
  CLASS_COLORS,
} from '../constants/theme';
import { GameSessionSummary } from '../stores/gameStore';

// ============================================
// Session Card (with relative time, class icon)
// ============================================

interface SessionCardProps {
  session: GameSessionSummary;
  onPress: (id: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

export function SessionCard({ session, onPress }: SessionCardProps) {
  const classColor = CLASS_COLORS[session.characterClass] ?? Colors.gold;
  const classIcon = CLASS_ICONS[session.characterClass] ?? '?';

  return (
    <TouchableOpacity
      onPress={() => onPress(session.id)}
      activeOpacity={0.7}
      style={styles.container}
      accessibilityRole="button"
      accessibilityLabel={`Continue adventure with ${session.characterName}, ${session.characterClass}. Last played ${formatRelativeTime(session.lastPlayed)}`}
    >
      <View style={[styles.classIndicator, { backgroundColor: classColor }]} />

      <View style={styles.content}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: `${classColor}22` }]}>
            <Text style={styles.icon}>{classIcon}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.characterName}>{session.characterName}</Text>
            <Text style={[styles.className, { color: classColor }]}>
              {session.characterClass.charAt(0).toUpperCase() + session.characterClass.slice(1)}
            </Text>
          </View>
          <Text style={styles.time}>{formatRelativeTime(session.lastPlayed)}</Text>
        </View>

        <View style={styles.details}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>{'📍'}</Text>
            <Text style={styles.location} numberOfLines={1}>
              {session.currentLocation || 'Unknown Location'}
            </Text>
          </View>
          <Text style={styles.turns}>{session.turnsPlayed} turns</Text>
        </View>

        {session.status === 'paused' && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>PAUSED</Text>
          </View>
        )}

        {session.status === 'active' && (
          <View style={styles.continueHint}>
            <Text style={styles.continueText}>Tap to continue</Text>
            <Text style={styles.continueArrow}>{'›'}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    ...Shadow.sm,
  },
  classIndicator: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  icon: {
    fontSize: 22,
  },
  headerText: {
    flex: 1,
  },
  characterName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  className: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginTop: 2,
  },
  time: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  location: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    flex: 1,
  },
  turns: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginLeft: Spacing.md,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    marginTop: Spacing.sm,
  },
  statusText: {
    color: Colors.goldMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 1,
  },
  continueHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: Spacing.sm,
  },
  continueText: {
    color: Colors.gold,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  continueArrow: {
    color: Colors.gold,
    fontSize: FontSize.lg,
    marginLeft: 4,
  },
});
