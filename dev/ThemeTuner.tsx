import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultBrand,
  defaultThemeColors,
  deriveBrandColors,
  themeColorVar,
  type ThemeColorKey,
} from "../themes";
import { getBrand, setBrand } from "../lib/themeBrand";

/**
 * A dev-only floating window that lists every theme color and lets you tune it
 * live with a color picker + eyedropper. It works by writing CSS custom
 * properties (`--bloom-<key>`) onto :root; `theme.colors` references those vars,
 * so every consumer updates instantly with no re-render. Overrides persist to
 * localStorage. Use "Copy as TS" to grab the tuned palette for themes.ts.
 */

const STORAGE_KEY = "bloom.themeTuner.overrides";

// ---- color parsing helpers -------------------------------------------------

interface ParsedColor {
  hex: string; // "#rrggbb"
  alpha: number; // 0..1
  /** Whether the original value carried an alpha channel (rgba / 8-digit hex). */
  hadAlpha: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const toHex2 = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");

/** Parse a hex or rgb(a) string. Returns null for anything else (e.g. shadows). */
function parseColor(value: string): ParsedColor | null {
  const v = value.trim();

  const hexMatch = /^#([0-9a-f]{3,8})$/i.exec(v);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    if (h.length === 4)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    if (h.length === 6) return { hex: `#${h.toLowerCase()}`, alpha: 1, hadAlpha: false };
    if (h.length === 8) {
      const alpha = parseInt(h.slice(6, 8), 16) / 255;
      return { hex: `#${h.slice(0, 6).toLowerCase()}`, alpha, hadAlpha: true };
    }
    return null;
  }

  const rgbMatch = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(",").map((p) => p.trim());
    if (parts.length >= 3) {
      const [r, g, b] = parts;
      const alpha = parts.length >= 4 ? parseFloat(parts[3]) : 1;
      return {
        hex: `#${toHex2(parseFloat(r))}${toHex2(parseFloat(g))}${toHex2(parseFloat(b))}`,
        alpha: Number.isFinite(alpha) ? clamp(alpha, 0, 1) : 1,
        hadAlpha: parts.length >= 4,
      };
    }
  }
  return null;
}

/** Build a CSS color string from a hex + alpha, choosing hex vs rgba sensibly. */
function toCssColor(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
}

// ---- override persistence + application ------------------------------------

function readStoredOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function applyVar(key: ThemeColorKey, value: string | null) {
  const name = themeColorVar(key);
  if (value === null) document.documentElement.style.removeProperty(name);
  else document.documentElement.style.setProperty(name, value);
}

/**
 * Re-apply persisted tuning on startup (called once, very early). Brand-derived
 * colors are applied first (for any key not manually overridden), then manual
 * overrides win on top.
 */
export function applyStoredThemeOverrides() {
  const stored = readStoredOverrides();
  const brand = getBrand();
  if (brand) {
    const derived = deriveBrandColors(brand);
    for (const [key, value] of Object.entries(derived)) {
      if (!(key in stored)) applyVar(key as ThemeColorKey, value);
    }
  }
  for (const [key, value] of Object.entries(stored)) {
    applyVar(key as ThemeColorKey, value);
  }
}

// ---- color groups (what the UI shows, in order) ----------------------------

const GROUPS: { title: string; keys: ThemeColorKey[] }[] = [
  { title: "Backgrounds", keys: ["appBackground", "surface", "surfaceAlt", "surfaceRaised"] },
  {
    title: "Overlays & fills",
    keys: ["overlay", "overlaySoft", "overlayStrong", "dropZone", "accentSubtle", "dangerSubtle"],
  },
  {
    title: "Foreground / text",
    keys: ["textPrimary", "textSecondary", "textMuted", "textOnAccent"],
  },
  { title: "Borders", keys: ["border", "borderMuted", "panelBorder", "dropZoneBorder"] },
  { title: "Accent", keys: ["accent", "accentHover", "focus"] },
  { title: "Status", keys: ["success", "successHover", "danger", "dangerHover"] },
];

// Keys whose values aren't single colors (box-shadow strings) — edited as text.
const EFFECT_KEYS: ThemeColorKey[] = ["accentShadow", "panelShadow", "insetShadow"];

// Quick brand presets — the official Bloom brand colors (see Bloom's
// bloomMaterialUITheme.ts). "Gold" is the app's shipped default accent.
const BRAND_PRESETS: { name: string; color: string }[] = [
  { name: "Bloom Blue", color: "#1d94a4" }, // current default
  { name: "Bloom Purple", color: "#96668f" },
  { name: "Bloom Red", color: "#d65649" },
  { name: "Gold", color: "#d6bb7b" }, // the original accent
];

// ---- eyedropper ------------------------------------------------------------

interface EyeDropperResult {
  sRGBHex: string;
}
interface EyeDropperConstructor {
  new (): { open: () => Promise<EyeDropperResult> };
}
const eyeDropperSupported = () =>
  typeof (window as unknown as { EyeDropper?: unknown }).EyeDropper === "function";

async function pickWithEyeDropper(): Promise<string | null> {
  const Ctor = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
  if (!Ctor) return null;
  try {
    const result = await new Ctor().open();
    return result.sRGBHex;
  } catch {
    return null; // user cancelled
  }
}

// ---- styles (self-contained so the tuner stays readable while you tune) ----

const ui = {
  text: "#e8eaed",
  textDim: "#9aa0a6",
  panel: "#202124",
  panelAlt: "#2a2b2e",
  border: "#3c4043",
  accent: "#8ab4f8",
};

const labelStyle: React.CSSProperties = {
  flex: "1 1 auto",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

// ---- row -------------------------------------------------------------------

function ColorRow({
  colorKey,
  value,
  isOverridden,
  onChange,
  onReset,
}: {
  colorKey: ThemeColorKey;
  value: string;
  isOverridden: boolean;
  onChange: (key: ThemeColorKey, value: string) => void;
  onReset: (key: ThemeColorKey) => void;
}) {
  const parsed = parseColor(value);
  const colorInputRef = useRef<HTMLInputElement>(null);

  if (!parsed) {
    // Non-color value (shouldn't happen for grouped keys) — show raw.
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
        <span style={labelStyle}>{colorKey}</span>
        <span style={{ color: ui.textDim }}>{value}</span>
      </div>
    );
  }

  const setFromHex = (hex: string) => onChange(colorKey, toCssColor(hex, parsed.alpha));
  const setAlpha = (alpha: number) => onChange(colorKey, toCssColor(parsed.hex, alpha));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
      {/* swatch (checkerboard behind so alpha reads correctly) */}
      <button
        type="button"
        title="Open color picker"
        onClick={() => colorInputRef.current?.click()}
        style={{
          position: "relative",
          width: 26,
          height: 22,
          flex: "0 0 auto",
          borderRadius: 4,
          border: `1px solid ${ui.border}`,
          cursor: "pointer",
          padding: 0,
          backgroundImage:
            "linear-gradient(45deg,#777 25%,transparent 25%),linear-gradient(-45deg,#777 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#777 75%),linear-gradient(-45deg,transparent 75%,#777 75%)",
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
        }}
      >
        <span style={{ position: "absolute", inset: 0, borderRadius: 3, background: value }} />
      </button>

      <input
        ref={colorInputRef}
        type="color"
        value={parsed.hex}
        onChange={(e) => setFromHex(e.target.value)}
        style={{ width: 0, height: 0, opacity: 0, position: "absolute", pointerEvents: "none" }}
      />

      <span style={labelStyle} title={`${colorKey}: ${value}`}>
        {colorKey}
        {isOverridden && <span style={{ color: ui.accent }}> •</span>}
      </span>

      {/* alpha slider */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={parsed.alpha}
        title={`alpha ${parsed.alpha.toFixed(2)}`}
        onChange={(e) => setAlpha(parseFloat(e.target.value))}
        style={{ width: 52, flex: "0 0 auto", accentColor: ui.accent }}
      />

      {eyeDropperSupported() && (
        <button
          type="button"
          title="Eyedropper — pick a color from anywhere on screen"
          onClick={async () => {
            const hex = await pickWithEyeDropper();
            if (hex) setFromHex(hex);
          }}
          style={iconBtnStyle}
        >
          💧
        </button>
      )}

      <button
        type="button"
        title={isOverridden ? "Reset to default" : "Unchanged"}
        disabled={!isOverridden}
        onClick={() => onReset(colorKey)}
        style={{ ...iconBtnStyle, opacity: isOverridden ? 1 : 0.3 }}
      >
        ↺
      </button>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  flex: "0 0 auto",
  width: 24,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  lineHeight: 1,
  borderRadius: 4,
  border: `1px solid ${ui.border}`,
  background: ui.panelAlt,
  color: ui.text,
  cursor: "pointer",
  padding: 0,
};

// ---- main window -----------------------------------------------------------

export default function ThemeTuner() {
  const [open, setOpen] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, string>>(() => readStoredOverrides());
  const [brandState, setBrandState] = useState<string | null>(() => getBrand());
  const brand = brandState ?? defaultBrand; // value shown in the picker
  const brandDerived = useMemo<Partial<Record<ThemeColorKey, string>>>(
    () => (brandState ? deriveBrandColors(brandState) : {}),
    [brandState],
  );
  const [pos, setPos] = useState({ x: -1, y: 12 }); // x:-1 → align right on first render
  const [copied, setCopied] = useState(false);
  const brandInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // Apply persisted overrides on mount so a reload keeps your tuning.
  useEffect(() => {
    applyStoredThemeOverrides();
  }, []);

  // Default to top-right corner once we know the viewport.
  useEffect(() => {
    if (pos.x === -1) setPos({ x: window.innerWidth - 332, y: 12 });
  }, [pos.x]);

  const persist = useCallback((next: Record<string, string>) => {
    try {
      if (Object.keys(next).length === 0) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, []);

  const handleChange = useCallback(
    (key: ThemeColorKey, value: string) => {
      applyVar(key, value);
      setOverrides((prev) => {
        const next = { ...prev, [key]: value };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const handleReset = useCallback(
    (key: ThemeColorKey) => {
      // Revert to the brand-derived value if a brand is set, else the default.
      applyVar(key, brandDerived[key] ?? null);
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[key];
        persist(next);
        return next;
      });
    },
    [persist, brandDerived],
  );

  // Pick a brand color: rebuild the MUI primary (via the store) AND derive the
  // whole accent family + warm text tints. Derived values flow through
  // `effective()` and the CSS vars; manual per-color overrides still win.
  const handleBrandChange = useCallback(
    (hex: string) => {
      setBrandState(hex);
      setBrand(hex);
      const derived = deriveBrandColors(hex);
      for (const [key, value] of Object.entries(derived)) {
        if (!(key in overrides)) applyVar(key as ThemeColorKey, value);
      }
    },
    [overrides],
  );

  const resetAll = useCallback(() => {
    for (const key of Object.keys(overrides)) applyVar(key as ThemeColorKey, null);
    for (const key of Object.keys(brandDerived)) applyVar(key as ThemeColorKey, null);
    setOverrides({});
    persist({});
    setBrandState(null);
    setBrand(null);
  }, [overrides, brandDerived, persist]);

  const effective = useCallback(
    (key: ThemeColorKey) => overrides[key] ?? brandDerived[key] ?? defaultThemeColors[key],
    [overrides, brandDerived],
  );

  const copyAsTs = useCallback(() => {
    const lines = (Object.keys(defaultThemeColors) as ThemeColorKey[]).map(
      (key) => `  ${key}: ${JSON.stringify(effective(key))},`,
    );
    const snippet = `export const defaultThemeColors = {\n${lines.join("\n")}\n};`;
    navigator.clipboard?.writeText(snippet).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  }, [effective]);

  // dragging via the title bar
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setPos({
      x: clamp(e.clientX - dragRef.current.dx, 0, window.innerWidth - 80),
      y: clamp(e.clientY - dragRef.current.dy, 0, window.innerHeight - 28),
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const overrideCount = Object.keys(overrides).length;

  const left = pos.x === -1 ? undefined : pos.x;

  return (
    <div
      data-theme-tuner
      style={{
        position: "fixed",
        top: pos.y,
        left,
        right: pos.x === -1 ? 12 : undefined,
        zIndex: 2147483647,
        width: 320,
        maxHeight: "calc(100vh - 24px)",
        display: "flex",
        flexDirection: "column",
        background: ui.panel,
        color: ui.text,
        border: `1px solid ${ui.border}`,
        borderRadius: 10,
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        font: "12px/1.4 ui-sans-serif, system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      {/* title bar (drag handle) */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          cursor: "move",
          borderBottom: open ? `1px solid ${ui.border}` : "none",
        }}
      >
        <strong style={{ flex: "1 1 auto", fontSize: 12, letterSpacing: 0.3 }}>
          🎨 Theme Tuner{overrideCount > 0 ? ` (${overrideCount})` : ""}
        </strong>
        <button
          type="button"
          title={open ? "Collapse" : "Expand"}
          onClick={() => setOpen((o) => !o)}
          style={iconBtnStyle}
        >
          {open ? "–" : "+"}
        </button>
      </div>

      {open && (
        <>
          <div style={{ overflowY: "auto", padding: "4px 10px 8px" }}>
            {/* Brand: one color that drives the whole accent family + text tints */}
            <div
              style={{
                marginTop: 6,
                padding: "8px",
                borderRadius: 8,
                background: ui.panelAlt,
                border: `1px solid ${ui.border}`,
              }}
            >
              <div
                style={{
                  color: ui.text,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  marginBottom: 6,
                }}
              >
                Brand color
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  title="Open brand color picker"
                  onClick={() => brandInputRef.current?.click()}
                  style={{
                    width: 30,
                    height: 26,
                    flex: "0 0 auto",
                    borderRadius: 5,
                    border: `1px solid ${ui.border}`,
                    background: brand,
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
                <input
                  ref={brandInputRef}
                  type="color"
                  value={brand}
                  onChange={(e) => handleBrandChange(e.target.value)}
                  style={{
                    width: 0,
                    height: 0,
                    opacity: 0,
                    position: "absolute",
                    pointerEvents: "none",
                  }}
                />
                <span style={{ flex: "1 1 auto", fontFamily: "ui-monospace, monospace" }}>
                  {brand}
                </span>
                {eyeDropperSupported() && (
                  <button
                    type="button"
                    title="Eyedropper — pick a brand color from anywhere on screen"
                    onClick={async () => {
                      const hex = await pickWithEyeDropper();
                      if (hex) handleBrandChange(hex);
                    }}
                    style={iconBtnStyle}
                  >
                    💧
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {BRAND_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleBrandChange(preset.color)}
                    title={preset.color}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: `1px solid ${brand.toLowerCase() === preset.color.toLowerCase() ? ui.accent : ui.border}`,
                      background: ui.panel,
                      color: ui.text,
                      cursor: "pointer",
                      fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: preset.color,
                        border: `1px solid ${ui.border}`,
                      }}
                    />
                    {preset.name}
                  </button>
                ))}
              </div>
              <div style={{ color: ui.textDim, fontSize: 10, marginTop: 6 }}>
                Drives accent, focus, borders, button color &amp; warm text tints.
              </div>
            </div>

            {GROUPS.map((group) => (
              <div key={group.title} style={{ marginTop: 8 }}>
                <div
                  style={{
                    color: ui.textDim,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    margin: "2px 0 2px",
                  }}
                >
                  {group.title}
                </div>
                {group.keys.map((key) => (
                  <ColorRow
                    key={key}
                    colorKey={key}
                    value={effective(key)}
                    isOverridden={key in overrides}
                    onChange={handleChange}
                    onReset={handleReset}
                  />
                ))}
              </div>
            ))}

            {/* shadow / effect strings — text editable, no picker */}
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  color: ui.textDim,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  margin: "2px 0 2px",
                }}
              >
                Effects (box-shadow)
              </div>
              {EFFECT_KEYS.map((key) => (
                <div
                  key={key}
                  style={{ display: "flex", flexDirection: "column", padding: "3px 0" }}
                >
                  <span style={{ color: ui.textDim, fontSize: 11 }}>
                    {key}
                    {key in overrides && <span style={{ color: ui.accent }}> •</span>}
                  </span>
                  <input
                    type="text"
                    value={effective(key)}
                    onChange={(e) => handleChange(key, e.target.value)}
                    spellCheck={false}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      marginTop: 2,
                      background: ui.panelAlt,
                      color: ui.text,
                      border: `1px solid ${ui.border}`,
                      borderRadius: 4,
                      padding: "3px 6px",
                      font: "11px/1.3 ui-monospace, monospace",
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* footer actions */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 10px",
              borderTop: `1px solid ${ui.border}`,
            }}
          >
            <button type="button" onClick={copyAsTs} style={footerBtnStyle}>
              {copied ? "Copied!" : "Copy as TS"}
            </button>
            <button
              type="button"
              onClick={resetAll}
              disabled={overrideCount === 0}
              style={{ ...footerBtnStyle, opacity: overrideCount === 0 ? 0.4 : 1 }}
            >
              Reset all
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const footerBtnStyle: React.CSSProperties = {
  flex: "1 1 0",
  padding: "6px 8px",
  borderRadius: 6,
  border: `1px solid ${ui.border}`,
  background: ui.panelAlt,
  color: ui.text,
  cursor: "pointer",
  fontSize: 12,
};
