import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '../../constants/theme';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useAuthStore } from '../../stores/authStore';

export default function RegisterScreen() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuthStore();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localErrors, setLocalErrors] = useState<{
    displayName?: string;
    email?: string;
    password?: string;
  }>({});

  const validate = (): boolean => {
    const errors: typeof localErrors = {};

    if (!displayName.trim()) {
      errors.displayName = 'Display name is required';
    } else if (displayName.trim().length < 2) {
      errors.displayName = 'Name must be at least 2 characters';
    }

    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Invalid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleRegister = async () => {
    clearError();
    if (!validate()) return;

    try {
      await register(email.trim(), password, displayName.trim());
      router.replace('/(main)/home');
    } catch {
      // Error is set in the store
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
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
              <Text style={styles.backArrow}>{'←'}</Text>
            </TouchableOpacity>

            <Text style={styles.headerIcon}>{'📜'}</Text>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              Register to begin your epic journey
            </Text>
          </View>

          {/* Error banner */}
          {error && (
            <View style={styles.errorBanner} accessibilityRole="alert">
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          )}

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Display Name"
              placeholder="Your adventurer name"
              value={displayName}
              onChangeText={(text) => {
                setDisplayName(text);
                if (localErrors.displayName)
                  setLocalErrors((e) => ({ ...e, displayName: undefined }));
              }}
              error={localErrors.displayName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
            />

            <Input
              label="Email"
              placeholder="adventurer@questcast.app"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (localErrors.email) setLocalErrors((e) => ({ ...e, email: undefined }));
              }}
              error={localErrors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />

            <Input
              label="Password"
              placeholder="At least 8 characters"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (localErrors.password) setLocalErrors((e) => ({ ...e, password: undefined }));
              }}
              error={localErrors.password}
              isPassword
              autoComplete="new-password"
              textContentType="newPassword"
              hint="Must be at least 8 characters"
            />

            <Button
              title="Create Account"
              onPress={handleRegister}
              isLoading={isLoading}
              fullWidth
              size="lg"
            />
          </View>

          {/* Login link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/login')}
              accessibilityRole="link"
            >
              <Text style={styles.footerLink}>Log In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
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
    fontSize: 56,
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
  errorBanner: {
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorBannerText: {
    color: Colors.dangerLight,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  form: {
    marginBottom: Spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: FontSize.md,
  },
  footerLink: {
    color: Colors.gold,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
});
