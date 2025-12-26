import JSON5 from "json5";
import type { ArtStyle, ArtStyleDefinition, ImageRecord } from "../types";
import artStyleCatalog from "../components/artStyle/art-styles.json5";

export const CLEAR_ART_STYLE_ID = "none";
export const STYLE_PARAM_KEY = "styleId";

const isClearingStyleId = (id?: string | null): boolean =>
  !id?.length || id === CLEAR_ART_STYLE_ID;

/**
 * Normalizes a style ID value. Returns null for empty or "none" values.
 */
export const normalizeStyleIdValue = (value?: string | null): string | null => {
  if (!value || isClearingStyleId(value)) {
    return null;
  }
  return value;
};

/**
 * Extracts the style ID from a tool parameters object.
 */
export const getStyleIdFromParams = (
  params?: Record<string, string>
): string | null => {
  if (!params) return null;
  const hasKey = Object.prototype.hasOwnProperty.call(params, STYLE_PARAM_KEY);
  if (!hasKey) {
    return null;
  }
  const raw = (params as Record<string, string | undefined>)[STYLE_PARAM_KEY];
  return normalizeStyleIdValue(raw ?? null);
};

/**
 * Extracts the effective style ID from an ImageRecord.
 * Checks sourceStyleId first, then falls back to parameters.
 */
export const getStyleIdFromImageRecord = (
  item?: ImageRecord | null
): string | null => {
  if (!item) return null;
  return (
    normalizeStyleIdValue(item.sourceStyleId ?? null) ||
    getStyleIdFromParams(item.parameters)
  );
};

/** @deprecated Use getStyleIdFromImageRecord. */
export const getStyleIdFromHistoryItem = getStyleIdFromImageRecord;

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

const previewModules = import.meta.glob<string>("../assets/art-styles/*", {
  eager: false,
  import: "default",
});

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

const previewModuleIndex = Object.keys(previewModules).reduce<
  Map<string, string>
>((acc, rawKey) => {
  const normalized = normalizeAssetPath(rawKey);
  if (normalized) {
    acc.set(normalized, rawKey);
    acc.set(`assets/${normalized}`, rawKey);
    const fileName = normalized.split("/").pop() || "";
    if (fileName) {
      const id = fileName.replace(/\.[^.]+$/, "");
      acc.set(id, rawKey);
    }
  }
  return acc;
}, new Map<string, string>());

const previewUrlCache = new Map<string, string>();

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const getModuleKeyForPath = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = normalizeAssetPath(value);
  if (!normalized) return null;
  return (
    previewModuleIndex.get(normalized) ??
    previewModuleIndex.get(`assets/${normalized}`) ??
    null
  );
};

const resolvePreviewSource = (
  style: ArtStyleDefinition
): { previewUrl: string | null; previewAssetKey: string | null } => {
  const candidate = style.sampleImageUrl;
  if (candidate) {
    if (isHttpUrl(candidate)) {
      return { previewUrl: candidate, previewAssetKey: null };
    }
    const moduleKey = getModuleKeyForPath(candidate);
    if (moduleKey) {
      return { previewUrl: null, previewAssetKey: moduleKey };
    }
  }

  const fallbackKey =
    previewModuleIndex.get(style.id) ??
    getModuleKeyForPath(`art-styles/${style.id}.png`) ??
    null;
  return { previewUrl: null, previewAssetKey: fallbackKey };
};

const normalizeCategoryList = (values?: string[]): string[] =>
  (values ?? [])
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value?.length));

export const ART_STYLES: ArtStyle[] = styleDefinitions.map((style) => {
  const previewSource = resolvePreviewSource(style);
  return {
    ...style,
    categories: normalizeCategoryList(style.categories),
    previewUrl: previewSource.previewUrl,
    previewAssetKey: previewSource.previewAssetKey,
  };
});

export const loadArtStylePreviewUrl = async (
  style: ArtStyle
): Promise<string | null> => {
  if (style.previewUrl) {
    return style.previewUrl;
  }
  const assetKey = style.previewAssetKey;
  if (!assetKey) {
    return null;
  }
  if (previewUrlCache.has(assetKey)) {
    return previewUrlCache.get(assetKey) ?? null;
  }
  const loader = previewModules[assetKey];
  if (!loader) {
    return null;
  }
  const url = await loader();
  previewUrlCache.set(assetKey, url);
  return url;
};

const includeClearStyle = (styles: ArtStyle[]): ArtStyle[] => {
  const hasClear = styles.some((style) => style.id === CLEAR_ART_STYLE_ID);
  if (hasClear) return styles;
  const clearStyle = ART_STYLES.find(
    (style) => style.id === CLEAR_ART_STYLE_ID
  );
  return clearStyle ? [clearStyle, ...styles] : styles;
};

const DEFAULT_CANDIDATES = ART_STYLES.filter(
  (style) => style.id !== CLEAR_ART_STYLE_ID
);

export const DEFAULT_ART_STYLE_ID =
  DEFAULT_CANDIDATES[0]?.id ?? ART_STYLES[0]?.id ?? "";

export const isClearArtStyleId = (id?: string | null): boolean =>
  isClearingStyleId(id);

const normalizeCategoryFilter = (categories?: string | string[]): string[] => {
  if (!categories) return [];
  const values = Array.isArray(categories) ? categories : [categories];
  return values
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value?.length));
};

export interface ArtStyleFilterOptions {
  categories?: string | string[];
  excludeNone?: boolean;
}

export const getArtStylesByCategories = (
  categories?: string | string[],
  options?: { excludeNone?: boolean }
): ArtStyle[] => {
  const excludeNone = options?.excludeNone ?? false;
  const normalized = normalizeCategoryFilter(categories);

  let result: ArtStyle[];

  if (!normalized.length) {
    result = ART_STYLES.slice();
  } else {
    result = ART_STYLES.filter((style) => {
      const styleCategories = style.categories ?? [];
      return styleCategories.some((category) =>
        normalized.includes(category.toLowerCase())
      );
    });
  }

  if (excludeNone) {
    result = result.filter((style) => style.id !== CLEAR_ART_STYLE_ID);
  } else {
    result = includeClearStyle(result);
  }

  return result;
};

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
  if (isClearingStyleId(id)) {
    return null;
  }
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
  if (isClearingStyleId(styleId)) {
    return core;
  }

  const normalizedId = styleId ?? undefined;
  const style = normalizedId ? getArtStyleById(normalizedId) : null;
  const styleSnippet = normalizedId
    ? getArtStylePrompt(normalizedId, mode)?.trim()
    : null;

  if (!styleSnippet && !style?.name?.trim()) {
    return core;
  }

  const styleName = style?.name?.trim();
  const artDirectionLabel = styleName
    ? `Art direction (${styleName}):`
    : "Art direction:";

  if (!styleSnippet) {
    return `${core}\n\n${artDirectionLabel}`;
  }

  return `${core}\n\n${artDirectionLabel} ${styleSnippet}`;
};
