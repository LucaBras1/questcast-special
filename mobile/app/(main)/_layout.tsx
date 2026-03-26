import React from 'react';
import { Stack } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function MainLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: 'fade_from_bottom',
        animationDuration: 250,
      }}
    >
      <Stack.Screen
        name="home"
        options={{ animation: 'fade' }}
      />
      <Stack.Screen
        name="tutorial"
        options={{ animation: 'fade' }}
      />
      <Stack.Screen
        name="new-game"
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="game/[id]"
        options={{
          gestureEnabled: false,
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="settings"
        options={{ animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
