import React, { useEffect, useState, useCallback } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';
import { SplashScreen } from '../components/SplashScreen';
import { useAuthStore } from '../stores/authStore';

export default function RootLayout() {
  const [splashVisible, setSplashVisible] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const checkAuth = useAuthStore((s) => s.checkAuth);

  // Initialize auth from SecureStore on app start
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Navigation guard: redirect based on auth state
  useEffect(() => {
    if (!isInitialized) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inMainGroup = segments[0] === '(main)';

    if (isAuthenticated && (inAuthGroup || segments[0] === undefined)) {
      // Authenticated users go to home
      router.replace('/(main)/home');
    } else if (!isAuthenticated && inMainGroup) {
      // Unauthenticated users go to welcome/login
      router.replace('/');
    }
  }, [isAuthenticated, isInitialized, segments, router]);

  const handleSplashComplete = useCallback(() => {
    setSplashVisible(false);
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
        <Stack.Screen name="+not-found" />
      </Stack>

      {/* Custom animated splash overlay */}
      {splashVisible && (
        <SplashScreen
          isReady={isInitialized}
          onAnimationComplete={handleSplashComplete}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
