import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";

import { HIT_SLOP, radius, space, type, type Palette } from "@/constants/theme";
import { useThemeColor, useThemedStyles } from "@/context/theme-store";

type IconName = keyof typeof Ionicons.glyphMap;
type Variant = "primary" | "secondary" | "ghost" | "danger";

// Screens pinned to a fixed palette (the video players) pass this so their
// controls keep readable chrome regardless of the app theme.
type PaletteOverride = Partial<Palette>;

export function Button({
  title,
  onPress,
  icon,
  variant = "secondary",
  disabled = false,
  loading = false,
  grow = false,
  accessibilityLabel,
  palette,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  grow?: boolean;
  accessibilityLabel?: string;
  palette?: PaletteOverride;
}) {
  const themed = useThemeColor();
  const color = palette ? { ...themed, ...palette } : themed;
  const styles = useThemedStyles(createStyles, palette);
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
          {icon ? <Ionicons name={icon} size={15} color={tint} /> : null}
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
  palette,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  disabled?: boolean;
  variant?: Variant;
  palette?: PaletteOverride;
}) {
  const themed = useThemeColor();
  const color = palette ? { ...themed, ...palette } : themed;
  const styles = useThemedStyles(createStyles, palette);
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
        size={18}
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
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({
  label,
  style,
  ...rest
}: TextInputProps & { label: string }) {
  const color = useThemeColor();
  const styles = useThemedStyles(createStyles);
  return (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={color.faint}
      underlineColorAndroid="transparent"
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
  const styles = useThemedStyles(createStyles);
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

export function Banner({
  source,
  title,
  subtitle,
  aspectRatio = 16 / 9,
  style,
}: {
  source?: string;
  title?: string;
  subtitle?: string;
  aspectRatio?: number;
  style?: ViewStyle;
}) {
  const styles = useThemedStyles(createStyles);
  if (!source) return null;
  return (
    <View style={[styles.banner, { aspectRatio }, style]}>
      <Image
        source={{ uri: source }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
        accessibilityLabel={title ? `Banner for ${title}` : "Banner image"}
      />
      {title || subtitle ? (
        <View style={styles.bannerOverlay}>
          {title ? (
            <Text numberOfLines={2} style={styles.bannerTitle}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text numberOfLines={1} style={styles.bannerSubtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function Poster({
  source,
  title,
  size = 44,
}: {
  source?: string;
  title: string;
  size?: number;
}) {
  const color = useThemeColor();
  const styles = useThemedStyles(createStyles);
  if (!source)
    return (
      <View
        style={[
          styles.poster,
          styles.posterFallback,
          { width: size, height: size * 1.5 },
        ]}
      >
        <Ionicons name="film-outline" size={14} color={color.faint} />
      </View>
    );
  return (
    <Image
      source={{ uri: source }}
      style={[styles.poster, { width: size, height: size * 1.5 }]}
      contentFit="cover"
      transition={150}
      accessibilityLabel={`Poster for ${title}`}
    />
  );
}

export function ProgressBar({ value }: { value: number }) {
  const styles = useThemedStyles(createStyles);
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
  const styles = useThemedStyles(createStyles);
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
    <View accessibilityLabel="Loading content" style={{ gap: 1 }}>
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
  const color = useThemeColor();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color={color.muted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}

export function SectionLabel({ index, title }: { index?: string; title: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionLabelText}>
        {index ? `${index} / ` : ""}
        {title}
      </Text>
      <View style={styles.sectionRule} />
    </View>
  );
}

function createStyles(color: Palette) {
  return StyleSheet.create({
  grow: { flex: 1 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs,
    backgroundColor: color.raised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.rule,
    paddingHorizontal: space.md,
    minHeight: 48,
  },
  primary: { backgroundColor: color.accent, borderColor: color.accent },
  ghost: { backgroundColor: "transparent", borderColor: color.rule },
  danger: { backgroundColor: color.errorBg, borderColor: color.errorBg },
  buttonText: { fontWeight: "600", fontSize: 13, letterSpacing: 0.6, textTransform: "uppercase" },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.3 },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  card: {
    padding: space.lg,
    borderRadius: radius.sm,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.border,
    gap: space.md,
  },
  input: {
    backgroundColor: "transparent",
    color: color.text,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 15,
    minHeight: 50,
    ...Platform.select({
      android: {
        includeFontPadding: false,
        textAlignVertical: "center" as const,
      },
      default: {},
    }),
  },
  segmented: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  segmentActive: { borderBottomColor: color.accent },
  segmentText: {
    color: color.faint,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  segmentTextActive: { color: color.text },
  banner: {
    overflow: "hidden",
    borderRadius: radius.sm,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.border,
  },
  bannerOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: space.md,
    backgroundColor: "rgba(11,11,11,0.78)",
    gap: 4,
  },
  bannerTitle: {
    color: color.text,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  bannerSubtitle: {
    color: color.taupe,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  poster: { borderRadius: radius.sm, backgroundColor: color.raised },
  posterFallback: { alignItems: "center", justifyContent: "center" },
  track: { height: 2, backgroundColor: color.border, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: color.accent },
  skeleton: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  skeletonBadge: { width: 28, height: 28, backgroundColor: color.border },
  skeletonLine: { height: 9, backgroundColor: color.border, marginBottom: 8 },
  skeletonLineShort: { width: "55%", marginBottom: 0 },
  empty: {
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.xxl,
    paddingHorizontal: space.lg,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.xs,
  },
  emptyTitle: {
    color: color.text,
    fontSize: type.h2,
    fontWeight: "700",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  emptyBody: {
    color: color.muted,
    fontSize: type.body,
    lineHeight: 23,
    textAlign: "center",
    maxWidth: 360,
    marginBottom: space.xs,
  },
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.xs,
  },
  sectionLabelText: {
    color: color.taupe,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  sectionRule: { flex: 1, height: 1, backgroundColor: color.border },
  });
}