import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";

import { useSeries } from "@/context/series-store";
import { useTheme } from "@/context/theme-store";

export default function TabsLayout() {
  const { queue } = useSeries();
  const { color } = useTheme();
  const pending = queue.length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg },
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.faint,
        tabBarStyle: {
          backgroundColor: color.bg,
          borderTopColor: color.border,
          borderTopWidth: 1,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontWeight: "600",
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        },
      }}
    >
      <Tabs.Screen
        name="movies"
        options={{
          title: "Movies",
          tabBarIcon: ({ color: tint, size }) => (
            <Ionicons
              name="film-outline"
              size={size}
              color={typeof tint === "string" ? tint : undefined}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Series",
            tabBarIcon: ({ color: tint, size }) => (
              <Ionicons
                name="albums-outline"
                size={size}
                color={typeof tint === "string" ? tint : undefined}
              />
            ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarBadgeStyle: {
            backgroundColor: color.taupe,
            color: color.ink,
            fontSize: 10,
            fontWeight: "700",
            borderRadius: 0,
          },
          tabBarIcon: ({ color: tint, size }) => (
            <View>
              <Ionicons
                name="download-outline"
                size={size}
                color={typeof tint === "string" ? tint : undefined}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
