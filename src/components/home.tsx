import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { radius, space, type Palette } from "@/constants/theme";
import { useTheme, useThemeColor, useThemedStyles } from "@/context/theme-store";
import { errorMessage } from "@/lib/series-client";

/**
 * Shared home chrome for the Movies and Series tabs. Keeping the brand, hero
 * copy and source row in one place stops the two home screens from drifting.
 */
export function HomeHeader({
  brand,
  title,
  subtitle,
}: {
  brand: string;
  title: string;
  subtitle: string;
}) {
  const color = useThemeColor();
  const styles = useThemedStyles(createStyles);
  const { dark, toggleDark } = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.topline}>
        <Text style={styles.brand}>{brand}</Text>
        <View style={styles.toplineActions}>
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={dark ? "Switch to light theme" : "Switch to dark theme"}
            accessibilityState={{ checked: dark }}
            hitSlop={8}
            onPress={toggleDark}
            style={({ pressed }) => [
              styles.themeToggle,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={dark ? "moon-outline" : "sunny-outline"}
              size={15}
              color={color.text}
            />
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Created by gdhanush27. Open GitHub profile"
            hitSlop={8}
            onPress={() => {
              void Linking.openURL("https://github.com/gdhanush27").catch(
                (exception) =>
                  Alert.alert("Could not open GitHub", errorMessage(exception)),
              );
            }}
          >
            <Text style={styles.pill}>@gdhanush27 ↗</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

/**
 * Compact source row: the active domain on the left, a hairline icon button on
 * the right that re-reads the published address list. No label, no oversized
 * call to action — the icon is the whole affordance.
 */
export function SourceRow({
  base,
  checking,
  disabled = false,
  onRefresh,
}: {
  base: string;
  checking: boolean;
  disabled?: boolean;
  onRefresh: () => void;
}) {
  const color = useThemeColor();
  const styles = useThemedStyles(createStyles);
  const inert = disabled || checking;
  return (
    <View style={styles.sourceRow}>
      <View style={styles.grow}>
        <Text style={styles.eyebrow}>SOURCE</Text>
        <Text numberOfLines={1} style={styles.sourceValue}>
          {checking ? "Checking…" : base}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Check for a new website address"
        accessibilityState={{ disabled: inert, busy: checking }}
        disabled={inert}
        hitSlop={8}
        onPress={onRefresh}
        style={({ pressed }) => [
          styles.sourceButton,
          inert && styles.disabled,
          pressed && !inert && styles.pressed,
        ]}
      >
        {checking ? (
          <ActivityIndicator size="small" color={color.text} />
        ) : (
          <Ionicons name="sync-outline" size={18} color={color.text} />
        )}
      </Pressable>
    </View>
  );
}

function createStyles(color: Palette) {
  return StyleSheet.create({
    grow: { flex: 1 },
    header: { gap: space.sm },
    topline: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    toplineActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.xs,
    },
    themeToggle: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: color.rule,
      borderRadius: radius.sm,
    },
    brand: {
      color: color.text,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 2.4,
      textTransform: "uppercase",
    },
    pill: {
      color: color.taupe,
      paddingHorizontal: space.xs,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: color.rule,
      borderRadius: radius.sm,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.2,
    },
    title: {
      color: color.text,
      fontSize: 38,
      lineHeight: 44,
      fontWeight: "700",
      letterSpacing: -1.4,
      marginTop: space.sm,
    },
    subtitle: {
      color: color.muted,
      fontSize: 15,
      lineHeight: 23,
      maxWidth: 420,
    },
    sourceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderWidth: 1,
      borderColor: color.border,
      backgroundColor: color.card,
      borderRadius: radius.sm,
    },
    eyebrow: {
      color: color.taupe,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 1.6,
      textTransform: "uppercase",
    },
    sourceValue: {
      color: color.text,
      fontSize: 13,
      fontWeight: "600",
      marginTop: 2,
    },
    sourceButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: color.rule,
      borderRadius: radius.sm,
    },
    pressed: { opacity: 0.6 },
    disabled: { opacity: 0.3 },
  });
}
