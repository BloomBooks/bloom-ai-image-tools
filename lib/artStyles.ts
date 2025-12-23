import JSON5 from "json5";
import type { ArtStyle, ArtStyleDefinition } from "../types";
import artStyleCatalog from "../data/art-styles.json5?raw";

const parseCatalog = (): ArtStyleDefinition[] => {
  try {
    const parsed = JSON5.parse(artStyleCatalog);
    return Array.isArray(parsed) ? (parsed as ArtStyleDefinition[]) : [];
  } catch (err) {
    console.error("Failed to parse art style catalog", err);
    return [];
  }
};

const styleDefinitions = parseCatalog();

const previewModules = import.meta.glob("../assets/art-styles/*", {
  eager: true,
  as: "url",
}) as Record<string, string>;

const normalizeAssetPath = (value?: string | null): string | null => {
  if (!value) return null;
  let normalized = value.replace(/\\/g, "/");
  normalized = normalized.replace(/^\.\/+/, "");
  normalized = normalized.replace(/^\/+/, "");
  normalized = normalized.replace(/^(\.\.\/)+/, "");
  if (normalized.startsWith("assets/")) {
    normalized = normalized.slice("assets/".length);
  }
  return normalized.length ? normalized : null;
};

const assetIndex = Object.entries(previewModules).reduce<{
  byId: Record<string, string>;
  byPath: Record<string, string>;
}>(
  (acc, [path, url]) => {
    const normalized = normalizeAssetPath(path);
    if (normalized) {
      acc.byPath[normalized] = url;
      acc.byPath[`assets/${normalized}`] = url;
      const fileName = normalized.split("/").pop() || "";
      if (fileName) {
        const id = fileName.replace(/\.[^.]+$/, "");
        acc.byId[id] = url;
      }
    }
    return acc;
  },
  {
    byId: {},
    byPath: {},
  }
);

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const resolvePreviewUrl = (style: ArtStyleDefinition): string | null => {
  const candidate = style.sampleImageUrl;
  if (candidate) {
    if (isHttpUrl(candidate)) {
      return candidate;
    }
    const normalized = normalizeAssetPath(candidate);
    if (normalized) {
      return (
        assetIndex.byPath[normalized] ||
        assetIndex.byPath[`assets/${normalized}`] ||
        null
      );
    }
  }
  return assetIndex.byId[style.id] || null;
};

export const ART_STYLES: ArtStyle[] = styleDefinitions.map((style) => ({
  ...style,
  previewUrl: resolvePreviewUrl(style),
}));

export const DEFAULT_ART_STYLE_ID = ART_STYLES[0]?.id ?? "";

export const getArtStyleById = (
  id: string | undefined | null
): ArtStyle | null => {
  if (!id) return null;
  return ART_STYLES.find((style) => style.id === id) ?? null;
};

export const getArtStylePrompt = (
  id: string | undefined,
  mode: "short" | "full" = "short"
): string | null => {
  const style = getArtStyleById(id);
  if (!style) return null;

  if (mode === "short") {
    return style.description;
  }

  return style.promptDetail;
};

export const applyArtStyleToPrompt = (
  basePrompt: string,
  styleId?: string | null,
  mode: "short" | "full" = "full"
): string => {
  const trimmed = basePrompt?.trim();
  const core = trimmed?.length ? trimmed : "Create an illustration.";
  const styleSnippet = getArtStylePrompt(styleId ?? undefined, mode);

  if (!styleSnippet) return core;

  return `${core}\n\nArt direction: ${styleSnippet}`;
};
