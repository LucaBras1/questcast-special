import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../../constants/theme';
import { Config } from '../../constants/config';
import { Button } from '../../components/Button';
import { useAuthStore } from '../../stores/authStore';
import { apiClient } from '../../services/api';
import { resetTutorialCompleted } from './tutorial';

// Settings persistence keys
const SETTINGS_KEY = 'questcast_settings';

interface AppSettings {
  narratorVolume: number;  // 0-1
  autoSave: boolean;
  language: 'cs' | 'en';
}

const DEFAULT_SETTINGS: AppSettings = {
  narratorVolume: 0.8,
  autoSave: true,
  language: 'en',
};

// Simple volume slider component (no external dep)
function VolumeSlider({
  value,
  onValueChange,
}: {
  value: number;
  onValueChange: (v: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (!dragging) setLocalValue(value);
  }, [value, dragging]);

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (_, gestureState) => {
      setDragging(true);
    },
    onPanResponderMove: (evt, _) => {
      if (trackWidth <= 0) return;
      const touchX = evt.nativeEvent.locationX;
      const newVal = Math.max(0, Math.min(1, touchX / trackWidth));
      setLocalValue(Math.round(newVal * 20) / 20); // Step of 0.05
    },
    onPanResponderRelease: () => {
      setDragging(false);
      onValueChange(localValue);
    },
  });

  const fillWidth = `${Math.round(localValue * 100)}%`;

  return (
    <View
      style={sliderStyles.container}
      onLayout={handleLayout}
      accessibilityRole="adjustable"
      accessibilityLabel={`Volume: ${Math.round(localValue * 100)} percent`}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(localValue * 100),
      }}
      {...panResponder.panHandlers}
    >
      <View style={sliderStyles.track}>
        <View style={[sliderStyles.fill, { width: fillWidth as `${number}%` }]} />
      </View>
      <View
        style={[
          sliderStyles.thumb,
          { left: `${Math.round(localValue * 100)}%` as `${number}%` },
        ]}
      />
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    height: 40,
    justifyContent: 'center',
    position: 'relative',
  },
  track: {
    height: 6,
    backgroundColor: Colors.surface,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    backgroundColor: Colors.gold,
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.goldLight,
    marginLeft: -11,
    ...Shadow.sm,
  },
});

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout, setUser } = useAuthStore();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load settings from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<AppSettings>;
          setSettings({
            ...DEFAULT_SETTINGS,
            ...parsed,
            language: user?.language ?? parsed.language ?? DEFAULT_SETTINGS.language,
          });
        } else if (user?.language) {
          setSettings((prev) => ({ ...prev, language: user.language }));
        }
      } catch {
        // Use defaults
      }
      setSettingsLoaded(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist settings whenever they change
  const persistSettings = useCallback(async (newSettings: AppSettings) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings));
    } catch {
      // Non-critical
    }
  }, []);

  const updateSetting = useCallback(<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      persistSettings(next);
      return next;
    });
  }, [persistSettings]);

  const isEnglish = settings.language === 'en';

  const handleLanguageToggle = () => {
    const newLang = isEnglish ? 'cs' as const : 'en' as const;
    updateSetting('language', newLang);
    if (user) {
      setUser({
        ...user,
        language: newLang,
      });
      // Sync to API (best-effort, don't block UI)
      apiClient.auth.updateProfile({ language: newLang }).catch(() => {
        // API sync failed - local change is preserved via AsyncStorage
      });
    }
  };

  const handleVolumeChange = (value: number) => {
    updateSetting('narratorVolume', Math.round(value * 100) / 100);
  };

  const handleAutoSaveToggle = () => {
    updateSetting('autoSave', !settings.autoSave);
  };

  const handleReplayTutorial = async () => {
    await resetTutorialCompleted();
    router.push('/(main)/tutorial');
  };

  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out? Your saved adventures will be available when you log back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/');
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
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
          <Text style={styles.title}>Settings</Text>
        </View>

        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PROFILE</Text>
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.displayName?.charAt(0)?.toUpperCase() ?? 'A'}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user?.displayName ?? 'Adventurer'}</Text>
                <Text style={styles.profileEmail}>{user?.email ?? ''}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Audio Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AUDIO</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLabelContainer}>
                <Text style={styles.settingIcon}>{'\uD83D\uDD0A'}</Text>
                <View style={styles.settingLabelContent}>
                  <Text style={styles.settingLabel}>Narrator Volume</Text>
                  <Text style={styles.settingDescription}>
                    {Math.round(settings.narratorVolume * 100)}%
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.volumeSliderContainer}>
              <Text style={styles.sliderMinLabel}>{'\uD83D\uDD07'}</Text>
              <View style={styles.sliderWrapper}>
                <VolumeSlider
                  value={settings.narratorVolume}
                  onValueChange={handleVolumeChange}
                />
              </View>
              <Text style={styles.sliderMaxLabel}>{'\uD83D\uDD0A'}</Text>
            </View>
          </View>
        </View>

        {/* Session Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SESSION</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLabelContainer}>
                <Text style={styles.settingIcon}>{'\uD83D\uDCBE'}</Text>
                <View>
                  <Text style={styles.settingLabel}>Auto-Save</Text>
                  <Text style={styles.settingDescription}>
                    Automatically save every {Config.AUTO_SAVE_INTERVAL_TURNS} turns
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.autoSave}
                onValueChange={handleAutoSaveToggle}
                trackColor={{ false: Colors.surface, true: Colors.goldDark }}
                thumbColor={settings.autoSave ? Colors.gold : Colors.textMuted}
                ios_backgroundColor={Colors.surface}
                accessibilityLabel="Toggle auto-save"
              />
            </View>
          </View>
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LANGUAGE</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLabelContainer}>
                <Text style={styles.settingIcon}>{'\uD83C\uDF10'}</Text>
                <View>
                  <Text style={styles.settingLabel}>Language</Text>
                  <Text style={styles.settingDescription}>
                    {isEnglish ? 'English' : 'Cestina'}
                  </Text>
                </View>
              </View>

              <View style={styles.languageToggle}>
                <Text style={[styles.langOption, !isEnglish && styles.langOptionActive]}>
                  CZ
                </Text>
                <Switch
                  value={isEnglish}
                  onValueChange={handleLanguageToggle}
                  trackColor={{ false: Colors.surface, true: Colors.surface }}
                  thumbColor={Colors.gold}
                  ios_backgroundColor={Colors.surface}
                  accessibilityLabel="Toggle language"
                />
                <Text style={[styles.langOption, isEnglish && styles.langOptionActive]}>
                  EN
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Game Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GAME</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLabelContainer}>
                <Text style={styles.settingIcon}>{'\uD83D\uDEE1\uFE0F'}</Text>
                <View>
                  <Text style={styles.settingLabel}>Content Rating</Text>
                  <Text style={styles.settingDescription}>{Config.CONTENT_RATING}</Text>
                </View>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{Config.CONTENT_RATING}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingLabelContainer}>
                <Text style={styles.settingIcon}>{'\u23F1\uFE0F'}</Text>
                <View>
                  <Text style={styles.settingLabel}>Session Time Limit</Text>
                  <Text style={styles.settingDescription}>
                    {Config.MAX_SESSION_MINUTES} minutes per session
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              onPress={handleReplayTutorial}
              style={styles.settingRow}
              accessibilityLabel="Replay tutorial"
              accessibilityRole="button"
              accessibilityHint="Double tap to replay the tutorial adventure"
            >
              <View style={styles.settingLabelContainer}>
                <Text style={styles.settingIcon}>{'\uD83C\uDFAC'}</Text>
                <View>
                  <Text style={styles.settingLabel}>Replay Tutorial</Text>
                  <Text style={styles.settingDescription}>
                    Experience the guided intro again
                  </Text>
                </View>
              </View>
              <Text style={styles.chevron}>{'\u203A'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingLabelContainer}>
                <Text style={styles.settingIcon}>{'\uD83D\uDCF1'}</Text>
                <View>
                  <Text style={styles.settingLabel}>App Version</Text>
                  <Text style={styles.settingDescription}>{Config.APP_VERSION} Alpha</Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={styles.settingLabelContainer}>
                <Text style={styles.settingIcon}>{'\uD83D\uDD2E'}</Text>
                <View>
                  <Text style={styles.settingLabel}>Questcast</Text>
                  <Text style={styles.settingDescription}>
                    AI-powered voice RPG adventures
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Logout */}
        <View style={styles.logoutSection}>
          <Button
            title="Log Out"
            onPress={handleLogout}
            variant="danger"
            fullWidth
          />
        </View>
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
    paddingBottom: Spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  backButton: {
    marginRight: Spacing.lg,
  },
  backArrow: {
    color: Colors.textSecondary,
    fontSize: 28,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  section: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.purpleDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.lg,
  },
  avatarText: {
    color: Colors.white,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  profileEmail: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  settingLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingLabelContent: {
    flex: 1,
  },
  settingIcon: {
    fontSize: 20,
    marginRight: Spacing.md,
  },
  settingLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.medium,
  },
  settingDescription: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginTop: 2,
  },

  // Volume Slider
  volumeSliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  sliderWrapper: {
    flex: 1,
  },
  sliderMinLabel: {
    fontSize: 14,
  },
  sliderMaxLabel: {
    fontSize: 14,
  },

  // Language
  languageToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  langOption: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  langOptionActive: {
    color: Colors.gold,
  },
  badge: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    color: Colors.goldMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.5,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg,
  },
  chevron: {
    fontSize: 24,
    color: Colors.textMuted,
    fontWeight: FontWeight.bold,
  },
  logoutSection: {
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg,
  },
});
