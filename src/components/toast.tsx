import { Ionicons } from "@expo/vector-icons";
import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { color, radius, space } from "@/constants/theme";

type ToastTone = "info" | "success" | "error";
type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onPress: () => void };
};
type ShowToast = (
  message: string,
  options?: { tone?: ToastTone; action?: Toast["action"] },
) => void;

const ToastContext = createContext<ShowToast>(() => {});
export const useToast = () => useContext(ToastContext);

const TONE: Record<
  ToastTone,
  { icon: keyof typeof Ionicons.glyphMap; tint: string }
> = {
  info: { icon: "information-circle", tint: color.muted },
  success: { icon: "checkmark-circle", tint: color.accent },
  error: { icon: "alert-circle", tint: color.error },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback<ShowToast>((message, options) => {
    if (timer.current) clearTimeout(timer.current);
    const next: Toast = {
      id: Date.now(),
      message,
      tone: options?.tone ?? "info",
      action: options?.action,
    };
    setToast(next);
    timer.current = setTimeout(
      () => setToast((current) => (current?.id === next.id ? null : current)),
      next.action ? 6000 : 3200,
    );
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <View
          pointerEvents="box-none"
          style={[styles.host, { bottom: insets.bottom + 24 }]}
        >
          <View accessibilityLiveRegion="polite" style={styles.toast}>
            <Ionicons
              name={TONE[toast.tone].icon}
              size={18}
              color={TONE[toast.tone].tint}
            />
            <Text numberOfLines={3} style={styles.message}>
              {toast.message}
            </Text>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  toast.action?.onPress();
                  dismiss();
                }}
                style={styles.action}
              >
                <Text style={styles.actionText}>{toast.action.label}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                onPress={dismiss}
                style={styles.action}
              >
                <Ionicons name="close" size={16} color={color.muted} />
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: space.lg,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    width: "100%",
    maxWidth: 520,
    paddingVertical: space.md,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    borderRadius: radius.md,
    backgroundColor: color.raised,
    borderWidth: 1,
    borderColor: color.border,
  },
  message: { flex: 1, color: color.text, fontSize: 14, lineHeight: 20 },
  action: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  actionText: { color: color.accent, fontWeight: "800", fontSize: 13 },
});
