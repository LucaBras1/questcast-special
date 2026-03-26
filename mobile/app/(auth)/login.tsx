import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius, Shadow } from '../../constants/theme';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useAuthStore } from '../../stores/authStore';

export default function LoginScreen() {
  const router = useRouter();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localErrors, setLocalErrors] = useState<{ email?: string; password?: string }>({});

  const validate = (): boolean => {
    const errors: { email?: string; password?: string } = {};

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

  const handleLogin = async () => {
    clearError();
    if (!validate()) return;

    try {
      await login(email.trim(), password);
      router.replace('/(main)/home');
    } catch {
      // Error is already set in the store
    }
  };

  const handleGoogleLogin = () => {
    Alert.alert('Coming Soon', 'Google login will be available in a future update.');
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

            <Text style={styles.headerIcon}>{'🏰'}</Text>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>
              Sign in to continue your adventures
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
              placeholder="Your secret passphrase"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (localErrors.password) setLocalErrors((e) => ({ ...e, password: undefined }));
              }}
              error={localErrors.password}
              isPassword
              autoComplete="password"
              textContentType="password"
            />

            <Button
              title="Log In"
              onPress={handleLogin}
              isLoading={isLoading}
              fullWidth
              size="lg"
            />
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google login */}
          <Button
            title="Continue with Google"
            onPress={handleGoogleLogin}
            variant="secondary"
            fullWidth
          />

          {/* Register link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity
              onPress={() => router.push('/(auth)/register')}
              accessibilityRole="link"
            >
              <Text style={styles.footerLink}>Register</Text>
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginHorizontal: Spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.xxl,
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
