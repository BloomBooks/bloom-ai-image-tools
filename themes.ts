/**
 * The canonical default values for every theme color. These are the literal
 * values the app ships with. At runtime `theme.colors` exposes each of these as
 * a CSS custom-property reference (`var(--bloom-<key>, <default>)`) so a dev
 * tuner can override any color live by setting the variable on :root — every
 * consumer picks up the change with no re-render. See dev/ThemeTuner.tsx.
 *
 * The accent family below is the Bloom Blue brand derivation (see
 * deriveBrandColors / defaultBrand).
 */
export const defaultThemeColors = {
  appBackground: "#0b1220",
  surface: "#0f172a",
  surfaceAlt: "#111827",
  surfaceRaised: "#1e293b",
  border: "#52463f",
  borderMuted: "#3f352f",
  panelBorder: "rgba(29, 148, 164, 0.34)",
  textPrimary: "#e2e8f0",
  textSecondary: "#bdd8db",
  textMuted: "#83aaaf",
  accent: "#1d94a4",
  textOnAccent: "#ffffff",
  accentHover: "#0c2326",
  accentSubtle: "rgba(29, 148, 164, 0.18)",
  accentShadow: "0 10px 25px rgba(12, 35, 38, 0.28)",
  focus: "#12d2ec",
  success: "#16a34a",
  successHover: "#15803d",
  danger: "#ef4444",
  dangerHover: "#dc2626",
  dangerSubtle: "rgba(239, 68, 68, 0.16)",
  overlay: "rgba(15, 23, 42, 0.78)",
  overlaySoft: "rgba(15, 23, 42, 0.55)",
  overlayStrong: "rgba(11, 17, 26, 0.9)",
  dropZone: "rgba(29, 148, 164, 0.18)",
  dropZoneBorder: "#1d94a4",
  panelShadow: "0 20px 45px rgba(0, 0, 0, 0.45)",
  insetShadow: "0 10px 20px rgba(0, 0, 0, 0.35)",
  scrollbarTrack: "#1f2937",
  scrollbarThumb: "#ad9a81",
  scrollbarThumbHover: "#ffffff",
};

export type ThemeColorKey = keyof typeof defaultThemeColors;

/** The CSS custom-property name used for a given theme color key. */
export const themeColorVar = (key: ThemeColorKey): string => `--bloom-${key}`;

const colorEntries = Object.entries(defaultThemeColors) as [ThemeColorKey, string][];

const buildScrollbarRootStyles = () => ({
  scrollbarColor: `${theme.colors.scrollbarThumb} ${theme.colors.scrollbarTrack}`,
  scrollbarWidth: "auto" as const,
});

export const getHighContrastScrollbarStyles = (selector?: string) => ({
  ...(selector ? { [selector]: buildScrollbarRootStyles() } : buildScrollbarRootStyles()),
  [`${selector ?? "&"}::-webkit-scrollbar`]: {
    width: 14,
    height: 14,
  },
  [`${selector ?? "&"}::-webkit-scrollbar-track`]: {
    backgroundColor: theme.colors.scrollbarTrack,
  },
  [`${selector ?? "&"}::-webkit-scrollbar-thumb`]: {
    backgroundColor: theme.colors.scrollbarThumb,
    borderRadius: 999,
    border: `3px solid ${theme.colors.scrollbarTrack}`,
  },
  [`${selector ?? "&"}::-webkit-scrollbar-thumb:hover`]: {
    backgroundColor: theme.colors.scrollbarThumbHover,
  },
});

export const theme = {
  colors: Object.fromEntries(
    colorEntries.map(([key, value]) => [key, `var(${themeColorVar(key)}, ${value})`]),
  ) as Record<ThemeColorKey, string>,
};

// ---------------------------------------------------------------------------
// Brand-derived palette
//
// Rather than hand-tuning a dozen accent colors, you can pick a single brand
// color and derive the whole accent family (plus the warm text tints) from it.
// `deriveBrandColors` reproduces the shipped gold palette when given kPrimary,
// and produces a coherent palette for any other hue (e.g. Bloom Purple/Blue).
// ---------------------------------------------------------------------------

/** The default brand color — drives the accent family in the shipped theme. */
export const defaultBrand = defaultThemeColors.accent; // Bloom Blue

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const int = m ? parseInt(m[1], 16) : 0;
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  s = clampPct(s) / 100;
  l = clampPct(l) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Turn a #rrggbb color into an `rgba(...)` string with the given alpha. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const int = m ? parseInt(m[1], 16) : 0;
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`;
}

/**
 * Pick a readable text color to sit on top of a given background color: dark
 * text on light backgrounds (e.g. the gold accent), white text on darker, more
 * saturated brands (Bloom Blue/Purple/Red). Uses perceived luminance.
 */
export function readableTextOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const int = m ? parseInt(m[1], 16) : 0;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const perceived = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (perceived > 0.6) {
    const { h, s } = hexToHsl(hex);
    return hslToHex(h, Math.min(70, s), 8); // very dark, brand-tinted
  }
  return "#ffffff";
}

/**
 * Derive the accent-family theme colors (and brand-tinted text) from a single
 * brand color. Returns a partial map keyed by ThemeColorKey. textPrimary,
 * backgrounds, borders, and status colors are intentionally left untouched.
 */
export function deriveBrandColors(brand: string): Partial<Record<ThemeColorKey, string>> {
  const { h, s, l } = hexToHsl(brand);
  const accentHover = hslToHex(h, s * 0.72, l - 28);
  const focus = hslToHex(h, Math.min(92, s + 16), Math.min(88, l + 12));
  return {
    accent: brand,
    accentHover,
    focus,
    textOnAccent: readableTextOn(brand),
    // Warm text tints share the brand hue but are heavily desaturated/lightened.
    textSecondary: hslToHex(h, 30, 80),
    textMuted: hslToHex(h, 22, 60),
    accentSubtle: hexWithAlpha(brand, 0.18),
    panelBorder: hexWithAlpha(brand, 0.34),
    dropZone: hexWithAlpha(brand, 0.18),
    dropZoneBorder: brand,
    accentShadow: `0 10px 25px ${hexWithAlpha(accentHover, 0.28)}`,
  };
}
