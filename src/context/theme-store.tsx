import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

import { palettes, type Palette } from "@/constants/theme";

export type Scheme = "light" | "dark";

const STORAGE_KEY = "zuno.theme-dark";

const ThemeContext = createContext<{
  dark: boolean;
  scheme: Scheme;
  color: Palette;
  toggleDark: () => void;
} | null>(null);

export function ThemeSettingsProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [dark, setDarkState] = useState<boolean>(systemScheme !== "light");

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || stored === null) return;
        if (stored === "dark") setDarkState(true);
        else if (stored === "light") setDarkState(false);
      })
      .catch(() => {
        // A missing or unreadable preference falls back to the OS scheme.
      });
    return () => {
      active = false;
    };
  }, []);

  const toggleDark = useCallback(() => {
    setDarkState((current) => {
      const next = !current;
      void AsyncStorage.setItem(STORAGE_KEY, next ? "dark" : "light").catch(
        () => {
          // Persisting the preference is best-effort; the session still updates.
        },
      );
      return next;
    });
  }, []);

  const scheme: Scheme = dark ? "dark" : "light";

  const value = useMemo(
    () => ({ dark, scheme, color: palettes[scheme], toggleDark }),
    [dark, scheme, toggleDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeSettingsProvider");
  }
  return context;
}

export function useThemeColor() {
  return useTheme().color;
}

const styleCache = new WeakMap<
  (color: Palette) => unknown,
  Map<Palette, unknown>
>();

/**
 * Builds a themed stylesheet once per (factory, palette) pair so components
 * re-render with new colors without recreating styles on every render.
 */
export function useThemedStyles<T>(
  factory: (color: Palette) => T,
  override?: Partial<Palette>,
): T {
  const { color } = useTheme();
  const resolved = useMemo(
    () => (override ? ({ ...color, ...override } as Palette) : color),
    [color, override],
  );
  return useMemo(() => {
    let perFactory = styleCache.get(factory);
    if (!perFactory) {
      perFactory = new Map();
      styleCache.set(factory, perFactory);
    }
    const cached = perFactory.get(resolved);
    if (cached) return cached as T;
    const created = factory(resolved);
    perFactory.set(resolved, created);
    return created;
  }, [factory, resolved]);
}
