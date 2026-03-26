import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  Shadow,
  CLASS_ICONS,
  CLASS_COLORS,
  CLASS_DESCRIPTIONS,
} from '../../constants/theme';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useGameStore, CharacterClass } from '../../stores/gameStore';
import { apiClient, ApiError } from '../../services/api';

const CHARACTER_CLASSES: CharacterClass[] = ['warrior', 'mage', 'rogue', 'ranger'];

// Class-specific starting stats
const CLASS_STARTING_STATS: Record<CharacterClass, {
  hp: number;
  gold: number;
  items: string[];
  abilities: string[];
}> = {
  warrior: {
    hp: 120,
    gold: 50,
    items: ['Iron Longsword', 'Wooden Shield', 'Chain Mail'],
    abilities: ['Power Strike', 'Shield Block'],
  },
  mage: {
    hp: 70,
    gold: 40,
    items: ['Oak Staff', 'Spellbook', 'Mana Potion'],
    abilities: ['Fireball', 'Arcane Shield'],
  },
  rogue: {
    hp: 85,
    gold: 75,
    items: ['Twin Daggers', 'Lockpick Set', 'Smoke Bomb'],
    abilities: ['Backstab', 'Stealth'],
  },
  ranger: {
    hp: 95,
    gold: 55,
    items: ['Longbow', 'Quiver (20 arrows)', 'Leather Armor'],
    abilities: ['Precise Shot', 'Animal Companion'],
  },
};

export default function NewGameScreen() {
  const router = useRouter();
  const { startSession, addMessage } = useGameStore();

  const [characterName, setCharacterName] = useState('');
  const [selectedClass, setSelectedClass] = useState<CharacterClass | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [creationError, setCreationError] = useState<string | null>(null);

  const handleCreate = async () => {
    // Validate
    if (!characterName.trim()) {
      setNameError('Your character needs a name');
      return;
    }
    if (characterName.trim().length < 2) {
      setNameError('Name must be at least 2 characters');
      return;
    }
    if (!selectedClass) {
      Alert.alert('Choose Your Path', 'Select a character class to continue.');
      return;
    }

    setIsCreating(true);
    setCreationError(null);

    try {
      const response = await apiClient.game.createSession({
        characterName: characterName.trim(),
        characterClass: selectedClass,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Initialize game state in store
      startSession({
        sessionId: response.sessionId,
        character: {
          id: response.character.id,
          name: response.character.name,
          class: response.character.class as CharacterClass,
          level: response.character.level,
          health: response.character.health,
          maxHealth: response.character.maxHealth,
          inventory: response.character.inventory,
          gold: response.character.gold,
          abilities: response.character.abilities,
        },
        currentLocation: 'The Beginning',
        activeQuest: '',
        questProgress: 0,
        turnsPlayed: 0,
        timeElapsedMinutes: 0,
        lastSavedAt: new Date().toISOString(),
      });

      // Add opening narration to transcript
      if (response.openingNarration) {
        addMessage({
          id: 'msg-opening',
          role: 'narrator',
          text: response.openingNarration,
          audioUrl: response.audioUrl,
          timestamp: Date.now(),
        });
      }

      router.replace(`/(main)/game/${response.sessionId}`);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      let message = 'Failed to create session. Please try again.';
      if (err instanceof ApiError) {
        if (err.status === 0 || err.code === 'NETWORK_ERROR') {
          message = 'No internet connection. Please check your network and try again.';
        } else if (err.status >= 500) {
          message = 'Server error. Please try again in a moment.';
        } else {
          message = err.message;
        }
      } else if (err instanceof Error) {
        if (err.message.includes('network') || err.message.includes('fetch')) {
          message = 'Network error. Please check your connection.';
        } else {
          message = err.message;
        }
      }

      setCreationError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const selectedStats = selectedClass ? CLASS_STARTING_STATS[selectedClass] : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.backArrow}>{'\u2190'}</Text>
          </TouchableOpacity>

          <Text style={styles.headerIcon}>{'\uD83E\uDDD9\u200D\u2642\uFE0F'}</Text>
          <Text style={styles.title}>Create Your Hero</Text>
          <Text style={styles.subtitle}>
            Choose wisely. Your class shapes your destiny.
          </Text>
        </View>

        {/* Character Name */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CHARACTER NAME</Text>
          <Input
            placeholder="Enter your hero's name..."
            value={characterName}
            onChangeText={(text) => {
              setCharacterName(text);
              if (nameError) setNameError(undefined);
              if (creationError) setCreationError(null);
            }}
            error={nameError}
            autoCapitalize="words"
          />
        </View>

        {/* Class Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CHOOSE YOUR CLASS</Text>
          <View style={styles.classGrid}>
            {CHARACTER_CLASSES.map((cls) => {
              const isSelected = selectedClass === cls;
              const color = CLASS_COLORS[cls];

              return (
                <TouchableOpacity
                  key={cls}
                  onPress={() => {
                    setSelectedClass(cls);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (creationError) setCreationError(null);
                  }}
                  activeOpacity={0.7}
                  style={[
                    styles.classCard,
                    isSelected && styles.classCardSelected,
                    isSelected && { borderColor: color },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${cls} class`}
                >
                  {/* Selection indicator */}
                  {isSelected && (
                    <View style={[styles.selectedDot, { backgroundColor: color }]} />
                  )}

                  <Text style={styles.classIcon}>{CLASS_ICONS[cls]}</Text>
                  <Text
                    style={[
                      styles.className,
                      isSelected && { color },
                    ]}
                  >
                    {cls.charAt(0).toUpperCase() + cls.slice(1)}
                  </Text>
                  <Text style={styles.classDescription} numberOfLines={3}>
                    {CLASS_DESCRIPTIONS[cls]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Starting Stats Preview */}
        {selectedStats && selectedClass && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>STARTING STATS</Text>
            <View style={[styles.statsPreviewCard, { borderColor: CLASS_COLORS[selectedClass] }]}>
              {/* HP & Gold */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statIcon}>{'\u2764\uFE0F'}</Text>
                  <Text style={styles.statValue}>{selectedStats.hp}</Text>
                  <Text style={styles.statLabel}>HP</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statIcon}>{'\uD83D\uDCB0'}</Text>
                  <Text style={styles.statValue}>{selectedStats.gold}</Text>
                  <Text style={styles.statLabel}>Gold</Text>
                </View>
              </View>

              {/* Starting Items */}
              <View style={styles.statsSection}>
                <Text style={styles.statsSectionTitle}>
                  {'\uD83C\uDF92'} Starting Items
                </Text>
                {selectedStats.items.map((item, idx) => (
                  <View key={idx} style={styles.statsListItem}>
                    <Text style={styles.statsListDot}>{'\u2022'}</Text>
                    <Text style={styles.statsListText}>{item}</Text>
                  </View>
                ))}
              </View>

              {/* Starting Abilities */}
              <View style={styles.statsSection}>
                <Text style={styles.statsSectionTitle}>
                  {'\u2728'} Starting Abilities
                </Text>
                <View style={styles.abilitiesRow}>
                  {selectedStats.abilities.map((ability, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.abilityTag,
                        { borderColor: CLASS_COLORS[selectedClass] },
                      ]}
                    >
                      <Text
                        style={[
                          styles.abilityTagText,
                          { color: CLASS_COLORS[selectedClass] },
                        ]}
                      >
                        {ability}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Error display */}
        {creationError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>{'\u26A0\uFE0F'}</Text>
            <Text style={styles.errorText}>{creationError}</Text>
          </View>
        )}

        {/* Create Button */}
        <View style={styles.createButtonContainer}>
          <Button
            title={isCreating ? 'Creating Adventure...' : 'Begin Adventure'}
            onPress={handleCreate}
            isLoading={isCreating}
            disabled={!characterName.trim() || !selectedClass || isCreating}
            fullWidth
            size="lg"
          />
        </View>

        {/* Loading overlay text */}
        {isCreating && (
          <View style={styles.creatingHint}>
            <ActivityIndicator size="small" color={Colors.gold} />
            <Text style={styles.creatingHintText}>
              The ancient scrolls unfurl... Preparing your adventure...
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    top: Spacing.xl,
    zIndex: 1,
  },
  backArrow: {
    color: Colors.textSecondary,
    fontSize: 28,
  },
  headerIcon: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  classGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  classCard: {
    width: '47%',
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadow.sm,
  },
  classCardSelected: {
    backgroundColor: Colors.surface,
    ...Shadow.md,
  },
  selectedDot: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  classIcon: {
    fontSize: 40,
    marginBottom: Spacing.sm,
  },
  className: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  classDescription: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Starting Stats Preview
  statsPreviewCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    ...Shadow.sm,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.md,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 80,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: Spacing.xs,
  },
  statValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  statsSection: {
    marginBottom: Spacing.md,
  },
  statsSectionTitle: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  statsListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  statsListDot: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  statsListText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  abilitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  abilityTag: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  abilityTagText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.3)',
    marginBottom: Spacing.lg,
  },
  errorIcon: {
    fontSize: 18,
    marginRight: Spacing.sm,
  },
  errorText: {
    flex: 1,
    color: Colors.dangerLight,
    fontSize: FontSize.sm,
  },
  createButtonContainer: {
    marginTop: Spacing.lg,
  },
  creatingHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  creatingHintText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontStyle: 'italic',
  },
});
