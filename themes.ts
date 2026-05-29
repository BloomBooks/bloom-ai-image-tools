export const kPrimary = "#d6bb7b";
export const kPrimaryTextBackground = "#7a6538"; // darker for better contrast

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
  colors: {
    appBackground: "#0b1220",
    surface: "#0f172a",
    surfaceAlt: "#111827",
    surfaceRaised: "#1e293b",
    border: "#52463f",
    borderMuted: "#3f352f",
    panelBorder: "rgba(214, 187, 123, 0.34)",
    textPrimary: "#e2e8f0",
    textSecondary: "#d9cdb9",
    textMuted: "#ad9a81",
    accent: kPrimary,
    textOnAccent: "#1a1205",
    accentHover: kPrimaryTextBackground,
    accentSubtle: "rgba(214, 187, 123, 0.18)",
    accentShadow: "0 10px 25px rgba(122, 101, 56, 0.28)",
    focus: "#f0d59a",
    success: "#16a34a",
    successHover: "#15803d",
    danger: "#ef4444",
    dangerHover: "#dc2626",
    dangerSubtle: "rgba(239, 68, 68, 0.16)",
    overlay: "rgba(15, 23, 42, 0.78)",
    overlaySoft: "rgba(15, 23, 42, 0.55)",
    overlayStrong: "rgba(11, 17, 26, 0.9)",
    dropZone: "rgba(214, 187, 123, 0.18)",
    dropZoneBorder: kPrimary,
    scrollbarTrack: "#1f2937",
    scrollbarThumb: "#ad9a81",
    scrollbarThumbHover: "#ffffff",
    panelShadow: "0 20px 45px rgba(0, 0, 0, 0.45)",
    insetShadow: "0 10px 20px rgba(0, 0, 0, 0.35)",
  },
};
