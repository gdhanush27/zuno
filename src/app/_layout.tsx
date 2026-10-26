import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { Observe, ObserveRoot } from "expo-observe";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ToastProvider } from "@/components/toast";
import { playerColor } from "@/constants/theme";
import { MovieProvider } from "@/context/movie-store";
import { SeriesProvider } from "@/context/series-store";
import {
  ThemeSettingsProvider,
  useTheme,
} from "@/context/theme-store";

Observe.configure({ integrations: { "expo-router": true } });

function ThemedApp() {
  const { color, scheme } = useTheme();

  const theme = useMemo(() => {
    const base = scheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: color.bg,
        card: color.card,
        border: color.border,
        primary: color.accent,
        text: color.text,
      },
    };
  }, [color, scheme]);

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <ToastProvider>
        <SeriesProvider>
          <MovieProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: color.bg },
                animation: "slide_from_right",
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="player"
                options={{
                  presentation: "fullScreenModal",
                  animation: "fade",
                  contentStyle: { backgroundColor: playerColor.screen },
                }}
              />
              <Stack.Screen
                name="movie-results"
                options={{ animation: "slide_from_right" }}
              />
              <Stack.Screen
                name="movie-player"
                options={{
                  presentation: "fullScreenModal",
                  animation: "fade",
                  contentStyle: { backgroundColor: playerColor.screen },
                }}
              />
            </Stack>
          </MovieProvider>
        </SeriesProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeSettingsProvider>
          <ThemedApp />
        </ThemeSettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default ObserveRoot.wrap(RootLayout);
