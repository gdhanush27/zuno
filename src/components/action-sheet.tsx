import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { space, type Palette } from "@/constants/theme";
import { useThemeColor, useThemedStyles } from "@/context/theme-store";

export type SheetAction = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
};

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const color = useThemeColor();
  const styles = useThemedStyles(createStyles);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        style={styles.backdrop}
        onPress={onClose}
      />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.handle} />
        <Text numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              action.onPress();
            }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Ionicons
              name={action.icon}
              size={20}
              color={action.destructive ? color.error : color.text}
            />
            <Text
              style={[styles.rowText, action.destructive && styles.destructive]}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

function createStyles(color: Palette) {
  return StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: color.backdrop },
  sheet: {
    backgroundColor: color.bg,
    borderTopWidth: 1,
    borderColor: color.rule,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: 0,
  },
  handle: {
    alignSelf: "center",
    width: 32,
    height: 2,
    backgroundColor: color.rule,
    marginBottom: space.md,
  },
  title: {
    color: color.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    marginBottom: space.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  pressed: { backgroundColor: color.raised },
  rowText: { color: color.text, fontSize: 15, fontWeight: "500" },
  destructive: { color: color.error },
  });
}
