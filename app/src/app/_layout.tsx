import "@/global.css";

import {
  BebasNeue_400Regular,
  useFonts,
} from "@expo-google-fonts/bebas-neue";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";

import { AuthProvider, useAuth, useProfile } from "@/lib/auth";
import { SessionProvider } from "@/lib/session/session-context";
import { isSupabaseConfigured } from "@/lib/supabase";
import { paletteFor, palettes } from "@/theme";

SplashScreen.preventAutoHideAsync();

const themes = {
  light: {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      primary: palettes.light.lamp,
      background: palettes.light.bg,
      card: palettes.light.surface,
      text: palettes.light.ink,
      border: palettes.light.line,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: palettes.dark.lamp,
      background: palettes.dark.bg,
      card: palettes.dark.surface,
      text: palettes.dark.ink,
      border: palettes.dark.line,
    },
  },
};

export default function RootLayout() {
  const scheme = useColorScheme();
  const [queryClient] = useState(() => new QueryClient());
  const [fontsLoaded, fontError] = useFonts({ BebasNeue_400Regular });

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SessionProvider>
          <ThemeProvider value={scheme === "light" ? themes.light : themes.dark}>
            <StatusBar style="auto" />
            <RootNavigator />
          </ThemeProvider>
        </SessionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/* Route guards: signed-in members with a finished onboarding see the app;
   signed-in members without one are held at onboarding; everyone else gets
   the box office. An unconfigured Supabase runs the app open — the bundled
   data.json was never secret, and a lockout would only break local dev. */
function RootNavigator() {
  const scheme = useColorScheme();
  const palette = paletteFor(scheme);
  const { session, isHydrating } = useAuth();
  const profileQuery = useProfile();

  const isAuthSettled =
    !isSupabaseConfigured ||
    (!isHydrating && (session === null || !profileQuery.isPending));

  useEffect(() => {
    if (isAuthSettled) SplashScreen.hideAsync();
  }, [isAuthSettled]);

  if (!isAuthSettled) return null;

  const isSignedIn = !isSupabaseConfigured || session !== null;
  const isOnboarded =
    !isSupabaseConfigured || Boolean(profileQuery.data?.onboarded_at);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}
    >
      <Stack.Protected guard={isSignedIn && isOnboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="film/[id]"
          options={{ presentation: "modal" }}
        />
        <Stack.Screen
          name="filters"
          options={{
            presentation: "formSheet",
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.75, 1.0],
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn && !isOnboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
