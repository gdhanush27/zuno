import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View } from "react-native";

import { color } from "@/constants/theme";
import { useSeries } from "@/context/series-store";

export default function TabsLayout() {
  const { queue } = useSeries();
  const pending = queue.length;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg },
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.faint,
        tabBarStyle: {
          backgroundColor: color.card,
          borderTopColor: color.border,
        },
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Browse",
          tabBarIcon: ({ color: tint, size }) => (
            <Ionicons name="albums-outline" size={size} color={tint} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarBadgeStyle: { backgroundColor: color.accent, color: color.ink },
          tabBarIcon: ({ color: tint, size }) => (
            <View>
              <Ionicons name="download-outline" size={size} color={tint} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
