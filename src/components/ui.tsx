import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    View,
    ViewStyle,
} from "react-native";

import { color, HIT_SLOP, radius, space } from "@/constants/theme";

type IconName = keyof typeof Ionicons.glyphMap;
type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  icon,
  variant = "secondary",
  disabled = false,
  loading = false,
  grow = false,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  grow?: boolean;
  accessibilityLabel?: string;
}) {
  const inert = disabled || loading;
  const tint =
    variant === "primary"
      ? color.ink
      : variant === "danger"
        ? color.error
        : color.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inert, busy: loading }}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.primary,
        variant === "ghost" && styles.ghost,
        variant === "danger" && styles.danger,
        grow && styles.grow,
        inert && styles.disabled,
        pressed && !inert && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tint} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={tint} /> : null}
          <Text numberOfLines={1} style={[styles.buttonText, { color: tint }]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  disabled = false,
  variant = "ghost",
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  variant?: Variant;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        variant === "ghost" && styles.ghost,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={variant === "danger" ? color.error : color.text}
      />
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({
  label,
  style,
  ...rest
}: TextInputProps & { label: string }) {
  return (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={color.faint}
      style={[styles.input, style]}
      {...rest}
    />
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              active && styles.segmentActive,
              disabled && styles.disabled,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.segmentText, active && styles.segmentTextActive]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const percent = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(percent), min: 0, max: 100 }}
      style={styles.track}
    >
      <View style={[styles.fill, { width: `${percent}%` }]} />
    </View>
  );
}

export function SkeletonRow() {
  return (
    <View style={styles.skeleton}>
      <View style={styles.skeletonBadge} />
      <View style={styles.grow}>
        <View style={styles.skeletonLine} />
        <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
      </View>
    </View>
  );
}

export function SkeletonList({ count = 6 }: { count?: number }) {
  return (
    <View accessibilityLabel="Loading content" style={{ gap: space.sm }}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color={color.faint} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    backgroundColor: color.raised,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  primary: { backgroundColor: color.accent },
  ghost: { backgroundColor: "transparent" },
  danger: { backgroundColor: color.errorBg },
  buttonText: { fontWeight: "700", fontSize: 14 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.35 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  card: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.md,
  },
  input: {
    backgroundColor: color.bg,
    color: color.text,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 16,
    minHeight: 50,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: color.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingHorizontal: space.xs,
  },
  segmentActive: { backgroundColor: color.raised },
  segmentText: { color: color.muted, fontSize: 13, fontWeight: "700" },
  segmentTextActive: { color: color.text },
  track: {
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: color.border,
    overflow: "hidden",
  },
  fill: { height: "100%", backgroundColor: color.accent },
  skeleton: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.card,
    opacity: 0.6,
  },
  skeletonBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: color.border,
  },
  skeletonLine: {
    height: 11,
    borderRadius: radius.pill,
    backgroundColor: color.border,
    marginBottom: 7,
  },
  skeletonLineShort: { width: "40%", marginBottom: 0 },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: 48 },
  emptyTitle: { color: color.text, fontSize: 17, fontWeight: "700" },
  emptyBody: {
    color: color.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 300,
  },
});
