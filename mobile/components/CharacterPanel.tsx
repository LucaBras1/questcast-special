import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
} from 'react-native';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
  CLASS_ICONS,
  CLASS_COLORS,
} from '../constants/theme';
import { HealthBar } from './HealthBar';
import type { Character } from '../../shared/types';

// ============================================
// Character Panel (expandable info panel)
// Collapsed: name, class icon, HP bar, level badge
// Expanded: full stats, inventory, abilities, quest
// ============================================

interface CharacterPanelProps {
  character: Character;
  level?: number;
  xp?: number;
  xpToNextLevel?: number;
  currentLocation?: string;
  activeQuest?: string;
  questProgress?: number;
}

const COLLAPSED_HEIGHT = 56;
const EXPANDED_MAX_HEIGHT = 420;

export function CharacterPanel({
  character,
  level,
  xp,
  xpToNextLevel,
  currentLocation,
  activeQuest,
  questProgress,
}: CharacterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const chevronRotation = useRef(new Animated.Value(0)).current;

  const classIcon = CLASS_ICONS[character.class] ?? '?';
  const classColor = CLASS_COLORS[character.class] ?? Colors.gold;
  const charLevel = level ?? character.level;

  const toggleExpand = useCallback(() => {
    const toExpanded = !isExpanded;
    setIsExpanded(toExpanded);

    Animated.parallel([
      Animated.spring(expandAnim, {
        toValue: toExpanded ? 1 : 0,
        friction: 8,
        tension: 60,
        useNativeDriver: false,
      }),
      Animated.timing(chevronRotation, {
        toValue: toExpanded ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isExpanded, expandAnim, chevronRotation]);

  const containerHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLLAPSED_HEIGHT, EXPANDED_MAX_HEIGHT],
  });

  const chevronRotate = chevronRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const expandOpacity = expandAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <Animated.View style={[styles.container, { maxHeight: containerHeight }]}>
      {/* Collapsed header - always visible */}
      <TouchableOpacity
        onPress={toggleExpand}
        activeOpacity={0.7}
        style={styles.header}
        accessibilityLabel={`Character info for ${character.name}. Tap to ${isExpanded ? 'collapse' : 'expand'}.`}
        accessibilityRole="button"
      >
        <View style={[styles.classIconContainer, { backgroundColor: `${classColor}33` }]}>
          <Text style={styles.classIconText}>{classIcon}</Text>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.charName} numberOfLines={1}>{character.name}</Text>
          <HealthBar
            current={character.health}
            max={character.maxHealth}
            height={5}
            showLabel={false}
          />
        </View>

        <View style={styles.headerRight}>
          <View style={styles.hpNumbers}>
            <Text style={styles.hpText}>
              {character.health}/{character.maxHealth}
            </Text>
          </View>
          <View style={[styles.levelBadge, { borderColor: classColor }]}>
            <Text style={[styles.levelText, { color: classColor }]}>
              Lv.{charLevel}
            </Text>
          </View>
        </View>

        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Text style={styles.chevron}>{'\u25BC'}</Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Expanded content */}
      <Animated.View style={[styles.expandedContent, { opacity: expandOpacity }]}>
        <ScrollView
          style={styles.expandedScroll}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {/* Stats Row */}
          <View style={styles.statsRow}>
            <StatItem icon={'❤️'} label="HP" value={`${character.health}/${character.maxHealth}`} />
            <StatItem icon={'⭐'} label="Level" value={`${charLevel}`} />
            <StatItem icon={'💰'} label="Gold" value={`${character.gold}`} />
          </View>

          {/* XP bar */}
          {xp != null && xpToNextLevel != null && (
            <View style={styles.xpSection}>
              <View style={styles.xpHeader}>
                <Text style={styles.xpLabel}>Experience</Text>
                <Text style={styles.xpValues}>{xp} / {xpToNextLevel}</Text>
              </View>
              <View style={styles.xpTrack}>
                <View
                  style={[
                    styles.xpFill,
                    { width: `${Math.min(100, (xp / xpToNextLevel) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Current Location */}
          {currentLocation && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>{'📍'}</Text>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{currentLocation}</Text>
              </View>
            </View>
          )}

          {/* Active Quest */}
          {activeQuest && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>{'📜'}</Text>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Active Quest</Text>
                <Text style={styles.infoValue}>{activeQuest}</Text>
                {questProgress != null && (
                  <View style={styles.questProgressContainer}>
                    <View style={styles.questProgressTrack}>
                      <View
                        style={[
                          styles.questProgressFill,
                          { width: `${Math.min(100, questProgress)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.questProgressText}>{questProgress}%</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Abilities */}
          {character.abilities.length > 0 && (
            <View style={styles.listSection}>
              <Text style={styles.listTitle}>{'✨ Abilities'}</Text>
              <View style={styles.tagContainer}>
                {character.abilities.map((ability, idx) => (
                  <View key={idx} style={[styles.tag, { borderColor: classColor }]}>
                    <Text style={[styles.tagText, { color: classColor }]}>{ability}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Inventory */}
          {character.inventory.length > 0 && (
            <View style={styles.listSection}>
              <Text style={styles.listTitle}>{'🎒 Inventory'}</Text>
              <View style={styles.inventoryList}>
                {character.inventory.slice(0, 20).map((item, idx) => (
                  <View key={idx} style={styles.inventoryItem}>
                    <Text style={styles.inventoryDot}>{'\u2022'}</Text>
                    <Text style={styles.inventoryText}>{item}</Text>
                  </View>
                ))}
                {character.inventory.length > 20 && (
                  <Text style={styles.moreText}>
                    +{character.inventory.length - 20} more items
                  </Text>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

function StatItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    overflow: 'hidden',
  },

  // Header (collapsed view)
  header: {
    height: COLLAPSED_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  classIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  classIconText: {
    fontSize: 18,
  },
  headerInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  charName: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    marginBottom: 3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  hpNumbers: {
    alignItems: 'flex-end',
  },
  hpText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    fontVariant: ['tabular-nums'],
  },
  levelBadge: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  levelText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  chevron: {
    color: Colors.textMuted,
    fontSize: 10,
    marginLeft: Spacing.xs,
  },

  // Expanded content
  expandedContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  expandedScroll: {
    flex: 1,
    paddingBottom: Spacing.md,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.md,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 60,
  },
  statIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },

  // XP
  xpSection: {
    marginBottom: Spacing.md,
  },
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  xpLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  xpValues: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontVariant: ['tabular-nums'],
  },
  xpTrack: {
    height: 4,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.round,
    overflow: 'hidden',
  },
  xpFill: {
    height: 4,
    backgroundColor: Colors.purple,
    borderRadius: BorderRadius.round,
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  infoIcon: {
    fontSize: 14,
    marginRight: Spacing.sm,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
  },

  // Quest progress
  questProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: Spacing.sm,
  },
  questProgressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.round,
    overflow: 'hidden',
  },
  questProgressFill: {
    height: 4,
    backgroundColor: Colors.gold,
    borderRadius: BorderRadius.round,
  },
  questProgressText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontVariant: ['tabular-nums'],
  },

  // List sections
  listSection: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  listTitle: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },

  // Abilities tags
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tag: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },

  // Inventory
  inventoryList: {
    gap: 4,
  },
  inventoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  inventoryDot: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  inventoryText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  moreText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
