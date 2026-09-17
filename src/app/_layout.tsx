import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function RootLayout() {
  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0C111B" },
        }}
      />
    </ThemeProvider>
  );
}
