import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/auth';
import { initializePurchases } from '@/lib/purchases';

// Custom dark theme with warm colors for bedtime app
const TraumfunkeDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#A78BFA', // Soft purple
    background: '#1A1625', // Deep purple-black
    card: '#2D2640', // Slightly lighter
    text: '#F5F3FF',
    border: '#4C4270',
    notification: '#F472B6',
  },
};

const TraumfunkeLightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#7C3AED', // Vibrant purple
    background: '#FEF9FF', // Soft lavender white
    card: '#FFFFFF',
    text: '#1A1625',
    border: '#E9E3F5',
    notification: '#EC4899',
  },
};

function RootLayoutNav() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Redirect to home if authenticated
      router.replace('/(app)/(tabs)/home');
    }

    if (session?.user?.id) {
      initializePurchases(session.user.id);
    }
  }, [session, isLoading, segments]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? TraumfunkeDarkTheme : TraumfunkeLightTheme}>
        <RootLayoutNav />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
