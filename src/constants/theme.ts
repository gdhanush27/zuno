import { Platform } from "react-native";

// Swiss / Minimalist system from design.md: off-black canvas, beige and taupe
// accents, hairline rules, sharp corners, monospace metadata.
export const palettes = {
  dark: {
    bg: "#0B0B0B",
    card: "#111111",
    raised: "#181818",
    border: "#262626",
    rule: "#383838",
    text: "#F7F5F0",
    muted: "#A8A8A8",
    faint: "#6E6E6E",
    accent: "#F5F1E8",
    ink: "#0B0B0B",
    taupe: "#B38B6D",
    beige: "#F5F1E8",
    error: "#E8A2A2",
    errorBg: "#1B1211",
    overlay: "rgba(11,11,11,0.78)",
    backdrop: "rgba(6,6,6,0.72)",
  },
  light: {
    bg: "#F7F5F0",
    card: "#FFFFFF",
    raised: "#EFEBE2",
    border: "#DCD6CA",
    rule: "#C4BCAD",
    text: "#14120F",
    muted: "#57514A",
    faint: "#8A8279",
    accent: "#14120F",
    ink: "#F7F5F0",
    taupe: "#8A6444",
    beige: "#F5F1E8",
    error: "#A3312B",
    errorBg: "#F7E7E5",
    overlay: "rgba(247,245,240,0.86)",
    backdrop: "rgba(20,18,15,0.45)",
  },
} as const;

export type Palette = { [K in keyof typeof palettes.dark]: string };

// The video players are intentionally always dark (cinema standard).
export const playerColor = {
  screen: "#060606",
  overlay: "rgba(6,6,6,0.86)",
  border: "#262626",
  text: "#F7F5F0",
  muted: "#A8A8A8",
  accent: "#F5F1E8",
  error: "#E8A2A2",
} as const;

export const radius = { sm: 0, md: 2, lg: 4, pill: 2 } as const;
export const space = { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

export const type = {
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }) as string,
  display: 40,
  h1: 28,
  h2: 20,
  body: 15,
  small: 13,
  label: 11,
} as const;

// Motion follows design.md: ease-out, 200-300ms, transform/opacity only.
export const motion = { fast: 200, base: 260, stagger: 80 } as const;
