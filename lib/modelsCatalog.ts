import JSON5 from "json5";
import modelCatalogText from "../data/models-registry.json5";
import type {
  MeasuredStats,
  ModelImageQuality,
  ModelInfo,
  ModelReasoningLevel,
  ToolDefinition,
} from "../types";
import {
  canUseLocalDummyModelWithoutApiKey,
  isLocalDummyModelOffered,
  LOCAL_DUMMY_MODEL_ID,
  withLocalModels,
} from "./localModels";
import {
  clampImageSizeTier,
  DEFAULT_SIZE_TOKEN,
  formatPixelSize,
  type ImageSizeTier,
  IMAGE_SIZE_TIERS,
  parseAspectRatio,
  type PixelSize,
  pixelsForTier,
  sizeTokenToImageSizeTier,
  snapToOpenAiImageSize,
} from "./imageSizes";

export const MODEL_CATALOG: ModelInfo[] = (() => {
  try {
    const parsed = JSON5.parse(modelCatalogText);
    return Array.isArray(parsed) ? withLocalModels(parsed as ModelInfo[]) : [];
  } catch (err) {
    console.error("Failed to parse model registry (JSON5)", err);
    return [];
  }
})();

export const DEFAULT_MODEL: ModelInfo | null =
  MODEL_CATALOG.find((model) => model.default) || MODEL_CATALOG[0] || null;

export const getModelInfoById = (modelId: string | null | undefined) => {
  const id = (modelId || "").trim();
  if (!id) return null;
  return MODEL_CATALOG.find((model) => model.id === id) || null;
};

export const getModelNameById = (modelId: string | null | undefined) => {
  return getModelInfoById(modelId)?.name || null;
};

/**
 * Resolves the ordered list of OpenRouter model keys to send for a request.
 * Returns `[id, fallbackId]` when the catalog entry declares a fallback, so
 * OpenRouter can route to the successor key once a `...-preview` key is retired.
 * Falls back to just the requested id for unknown models (e.g. env overrides).
 */
export const getRequestModelIds = (modelId: string | null | undefined): string[] => {
  const id = (modelId || "").trim();
  if (!id) return [];
  const fallbackId = getModelInfoById(id)?.fallbackId?.trim();
  return fallbackId && fallbackId !== id ? [id, fallbackId] : [id];
};

/**
 * Which OpenRouter endpoint serves a model. Defaults to chat/completions,
 * which is what every chat-style image model uses; a dedicated image model
 * declares "images" in the catalog and 400s on chat/completions. An unknown id
 * (an env override, or a key the registry has not caught up with) gets the
 * default.
 */
export const getOpenRouterEndpointForModel = (
  modelId: string | null | undefined,
): "chat/completions" | "images" =>
  getModelInfoById(modelId)?.openRouterEndpoint ?? "chat/completions";

/**
 * The reasoning levels a model accepts, in the order the picker should offer
 * them. Empty means the model takes no reasoning parameter, and the picker
 * shows no reasoning control.
 *
 * Each catalog entry lists its own levels, because they differ per model rather
 * than per family: Gemini 3 Pro Image makes thinking mandatory and answers
 * `effort: "none"` with a 400, while the 3.1 Flash keys have two thinking
 * levels and treat "low", "medium" and "high" as the same one. An unknown id
 * (an env override, or a key the registry has not caught up with) gets the full
 * set rather than none, so a level stays reachable.
 */
export const getReasoningLevelsForModel = (
  modelId: string | null | undefined,
): ModelReasoningLevel[] => {
  const model = getModelInfoById(modelId);
  if (!model) return [...MODEL_REASONING_LEVELS];
  return model.reasoningLevels ? [...model.reasoningLevels] : [];
};

/**
 * What to put in a request to ask a model for a particular output size, or null
 * when the model takes no size parameter and the caller should send none.
 *
 * Each family is resolved by its own rule rather than a shared one, because the
 * two take different kinds of value: a Gemini key takes a tier token capped by
 * the model's ceiling, and a GPT Image 2.5 key takes pixels snapped to its own
 * constraints. `desiredPixels` is what the caller actually wants (Bloom's
 * suggested target for a book slot, say); `aspectRatio` is the shape the user
 * picked; `requestedTier` is the coarse choice from the size picker, which
 * decides the long edge when there are no exact pixels to honour.
 *
 * A pixel-size model gets null when the caller knows neither exact pixels nor a
 * concrete shape. Falling back to a square would be worse than sending nothing:
 * on an edit, an explicit size overrides the source image's shape, so a guess
 * would crop or letterbox every edit whose tool has no shape picker.
 */
export type ImageSizeRequest =
  | { parameter: "image_config.image_size"; value: ImageSizeTier }
  | { parameter: "size"; value: string };

export const resolveImageSizeRequest = (
  modelId: string | null | undefined,
  requestedTier: ImageSizeTier,
  options?: { desiredPixels?: PixelSize | null; aspectRatio?: string | null },
): ImageSizeRequest | null => {
  const parameter = getModelInfoById(modelId)?.sizeParameter;
  if (!parameter) {
    return null;
  }
  if (parameter === "image_config.image_size") {
    return { parameter, value: resolveImageSizeTierForModel(modelId, requestedTier) };
  }
  const target =
    options?.desiredPixels ??
    (parseAspectRatio(options?.aspectRatio)
      ? pixelsForTier(requestedTier, options?.aspectRatio)
      : null);
  if (!target) {
    return null;
  }
  return { parameter, value: formatPixelSize(snapToOpenAiImageSize(target)) };
};

/**
 * The largest `image_config.image_size` tier a model accepts, or null when the
 * catalog does not say. Null means "do not clamp": an unknown id (an env
 * override, or a key the registry has not caught up with) is better sent as
 * asked than silently reduced.
 */
export const getMaxImageSizeForModel = (modelId: string | null | undefined): ImageSizeTier | null =>
  getModelInfoById(modelId)?.maxImageSize ?? null;

/**
 * The most input images a model takes in one request (edit image plus
 * references), or null when the catalog does not know and nothing should be
 * checked. See ModelInfo.maxInputImages.
 */
export const getMaxInputImagesForModel = (modelId: string | null | undefined): number | null =>
  getModelInfoById(modelId)?.maxInputImages ?? null;

/** Whether this model takes its output size as pixels ("1536x1024"). */
export const modelTakesPixelSize = (modelId: string | null | undefined): boolean =>
  getModelInfoById(modelId)?.sizeParameter === "size";

/**
 * The size a model would actually be sent for the pixels asked of it: snapped
 * to the model's own rules for a pixel-size model (GPT Image 2.5's 16-pixel
 * grid, 3840 edge and pixel budget), and unchanged for every other model,
 * whose tier tokens the labels already describe. This is what a label should
 * show so it does not promise pixels the request cannot carry.
 */
export const snapPixelsForModel = (
  modelId: string | null | undefined,
  desired: PixelSize | null,
): PixelSize | null => {
  if (!desired || !modelTakesPixelSize(modelId)) return desired;
  return snapToOpenAiImageSize(desired);
};

/**
 * The size options to offer for a model, each with the label to show. A model
 * that takes tier tokens shows the token itself. A pixel-size model shows the
 * pixels it will be sent for that token in the given shape, and two tokens that
 * land on the same pixels ("512k" and "1k" both become 1024 on the long edge)
 * collapse into one, so the list never offers the same request twice.
 */
export const getSizeOptionsForModel = (
  options: string[] | null | undefined,
  modelId: string | null | undefined,
  aspectRatio: string | null | undefined,
): { token: string; label: string }[] => {
  const tokens = getSizeTokenOptionsForModel(options, modelId);
  if (!modelTakesPixelSize(modelId)) {
    return tokens.map((token) => ({ token, label: token }));
  }
  const seen = new Set<string>();
  const result: { token: string; label: string }[] = [];
  for (const token of tokens) {
    const request = resolveImageSizeRequest(modelId, sizeTokenToImageSizeTier(token), {
      aspectRatio: parseAspectRatio(aspectRatio) ? aspectRatio : "1:1",
    });
    const label = request?.parameter === "size" ? request.value : token;
    if (seen.has(label)) continue;
    seen.add(label);
    result.push({ token, label });
  }
  return result;
};

/**
 * The `quality` values a model takes, in the order the picker should offer
 * them. Empty means the model takes no quality parameter, and the picker shows
 * no quality control. See ModelInfo.qualityLevels.
 */
export const getQualityLevelsForModel = (modelId: string | null | undefined): ModelImageQuality[] =>
  getModelInfoById(modelId)?.qualityLevels ?? [];

export const MODEL_IMAGE_QUALITIES: ModelImageQuality[] = [
  "auto",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export const isModelImageQuality = (value: unknown): value is ModelImageQuality =>
  typeof value === "string" && MODEL_IMAGE_QUALITIES.includes(value as ModelImageQuality);

/**
 * The quality a run of this tool on this model sends: the user's remembered
 * choice when the model takes it, else "auto" for a model that takes quality at
 * all, else null, and the request carries no quality parameter. A choice
 * remembered under one model is not sent to another that does not list it.
 */
export const resolveToolQuality = (
  tool: ToolDefinition,
  model: ModelInfo | null,
  qualityByTool?: Record<string, ModelImageQuality>,
): ModelImageQuality | null => {
  const accepted = getQualityLevelsForModel(model?.id);
  if (accepted.length === 0) return null;
  const remembered = qualityByTool?.[tool.id];
  if (isModelImageQuality(remembered) && accepted.includes(remembered)) return remembered;
  return accepted.includes("auto") ? "auto" : accepted[0];
};

/**
 * The tier to put in a request for this model: what the caller asked for,
 * reduced to the model's ceiling. OpenRouter answers an over-large tier with a
 * 400, so this must run before the request goes out.
 */
export const resolveImageSizeTierForModel = (
  modelId: string | null | undefined,
  requested: ImageSizeTier,
): ImageSizeTier => clampImageSizeTier(requested, getMaxImageSizeForModel(modelId));

/**
 * The size tokens worth offering for a model: the tool's own options minus the
 * ones above the model's ceiling. Keeps a user from picking a size that can
 * only come back as an error.
 */
export const getSizeTokenOptionsForModel = (
  options: string[] | null | undefined,
  modelId: string | null | undefined,
): string[] => {
  const allOptions = options ?? [];
  const maximum = getMaxImageSizeForModel(modelId);
  if (!maximum) return [...allOptions];
  const kept = allOptions.filter(
    (token) =>
      IMAGE_SIZE_TIERS.indexOf(sizeTokenToImageSizeTier(token)) <=
      IMAGE_SIZE_TIERS.indexOf(maximum),
  );
  // Never offer an empty list: a tool whose options all sit above the ceiling
  // still needs one choice, so keep the smallest one it declared.
  return kept.length ? kept : allOptions.slice(0, 1);
};

export const MODEL_REASONING_LEVELS: ModelReasoningLevel[] = [
  "default",
  "none",
  "low",
  "medium",
  "high",
];

export const isModelReasoningLevel = (value: unknown): value is ModelReasoningLevel =>
  typeof value === "string" && MODEL_REASONING_LEVELS.includes(value as ModelReasoningLevel);

// Shared default option list for tools that don't declare their own `modelIds`:
// every real image-capable catalog model (the localhost-only dummy is excluded),
// with the catalog default (GPT Image 2.5 Flare) recommended.
const DEFAULT_TOOL_MODEL_IDS = MODEL_CATALOG.filter(
  (model) => model.id !== LOCAL_DUMMY_MODEL_ID,
).map((model) => model.id);

// Raw set of model ids a tool may run on (base list minus disallowed), in base
// order and limited to ids that exist in the catalog. Unordered with respect to
// recommendations — getToolModelOptions applies the default-first ordering.
const getAllowedModelIds = (tool: ToolDefinition): string[] => {
  const base = tool.modelIds?.length ? tool.modelIds : DEFAULT_TOOL_MODEL_IDS;
  const disallowed = new Set(tool.disallowedModelIds ?? []);
  const seen = new Set<string>();
  const ids: string[] = [];
  base.forEach((id) => {
    if (disallowed.has(id) || seen.has(id) || !getModelInfoById(id)) return;
    seen.add(id);
    ids.push(id);
  });
  // The dummy model is only present in the catalog on localhost (see
  // withLocalModels). Where it exists AND developer tools are enabled
  // (standalone dev, or a host that opted in via showDeveloperTools), offer it
  // on every tool (unless the tool explicitly disallows it) as a no-network
  // engine for UI testing.
  if (
    isLocalDummyModelOffered() &&
    getModelInfoById(LOCAL_DUMMY_MODEL_ID) &&
    !disallowed.has(LOCAL_DUMMY_MODEL_ID) &&
    !seen.has(LOCAL_DUMMY_MODEL_ID)
  ) {
    ids.push(LOCAL_DUMMY_MODEL_ID);
  }
  return ids;
};

/** Recommended (ordered) model ids for a tool, limited to its allowed options. */
export const getRecommendedModelIds = (tool: ToolDefinition): string[] => {
  const allowed = new Set(getAllowedModelIds(tool));
  if (tool.recommendedModelIds?.length) {
    return tool.recommendedModelIds.filter((id) => allowed.has(id));
  }
  // No explicit recommendation: prefer the catalog default when it's allowed.
  if (DEFAULT_MODEL && allowed.has(DEFAULT_MODEL.id)) {
    return [DEFAULT_MODEL.id];
  }
  return [];
};

/**
 * Models a tool may run on, resolved to catalog entries and ordered
 * default-first: the recommended models (in their declared order, so the
 * default comes first) followed by any remaining allowed models.
 */
export const getToolModelOptions = (tool: ToolDefinition): ModelInfo[] => {
  const allowedIds = getAllowedModelIds(tool);
  const recommended = getRecommendedModelIds(tool);
  const recommendedSet = new Set(recommended);
  const orderedIds = [...recommended, ...allowedIds.filter((id) => !recommendedSet.has(id))];
  return orderedIds
    .map((id) => getModelInfoById(id))
    .filter((model): model is ModelInfo => model !== null);
};

/**
 * The model a tool should run on: the user's persisted choice when it's still a
 * valid option, otherwise the first recommended model, otherwise the first
 * option, otherwise the catalog default.
 */
export const resolveToolModelId = (
  tool: ToolDefinition,
  modelByTool?: Record<string, string>,
): string => {
  const optionIds = getToolModelOptions(tool).map((model) => model.id);
  const persisted = modelByTool?.[tool.id];
  if (persisted && optionIds.includes(persisted)) {
    return persisted;
  }
  const recommended = getRecommendedModelIds(tool);
  if (recommended.length) {
    return recommended[0];
  }
  if (optionIds.length) {
    return optionIds[0];
  }
  return DEFAULT_MODEL?.id ?? "";
};

/**
 * Effective reasoning level for a tool run: the per-tool override, then the
 * tool's hard `imageReasoningLevel` cap, then the model's initial level, then
 * "default".
 *
 * A level the chosen model does not accept becomes "default", so a setting
 * remembered from another model cannot be sent as, say, "none" to Gemini 3 Pro
 * Image, which answers that with a 400.
 */
export const resolveToolReasoningLevel = (
  tool: ToolDefinition,
  model: ModelInfo | null,
  reasoningByTool?: Record<string, ModelReasoningLevel>,
): ModelReasoningLevel => {
  const accepted = getReasoningLevelsForModel(model?.id);
  const take = (level: ModelReasoningLevel | undefined): ModelReasoningLevel | null =>
    isModelReasoningLevel(level) && accepted.includes(level) ? level : null;

  return (
    take(reasoningByTool?.[tool.id]) ??
    take(tool.imageReasoningLevel) ??
    take(model?.initialReasoningLevel) ??
    "default"
  );
};

/**
 * The per-image USD price a tool would currently run at, for batch cost
 * estimates (N ticked images × this value). Returns null for tools/models with
 * no fixed per-image price: local-only tools (e.g. `remove_background`), the
 * localhost-only dummy model, or a catalog entry with no `pricePerImageUsd`.
 */
export const getEstimatedCostPerImageUsd = (
  tool: ToolDefinition,
  modelByTool?: Record<string, string>,
): number | null => {
  // Mirrors the "requiresOpenRouter" check in ImageTool.tsx: remove_background
  // runs free/local rather than through a priced catalog model.
  if (tool.id === "remove_background" || tool.localOnly) {
    return null;
  }
  const modelId = resolveToolModelId(tool, modelByTool);
  if (canUseLocalDummyModelWithoutApiKey(modelId)) {
    return null;
  }
  const price = getModelInfoById(modelId)?.pricePerImageUsd;
  return typeof price === "number" && price > 0 ? price : null;
};

export const buildMeasuredStatKey = (
  toolId: string,
  modelId: string,
  reasoningLevel: ModelReasoningLevel,
  sizeToken: string | null | undefined,
): string =>
  `${toolId}|${modelId}|${reasoningLevel}|${(sizeToken || "").trim() || DEFAULT_SIZE_TOKEN}`;

export const getMeasuredStats = (
  toolId: string,
  modelId: string,
  reasoningLevel: ModelReasoningLevel,
  sizeToken: string | null | undefined,
  measuredStatsByKey: Record<string, MeasuredStats> | undefined,
): MeasuredStats | null => {
  const value =
    measuredStatsByKey?.[buildMeasuredStatKey(toolId, modelId, reasoningLevel, sizeToken)];
  if (!value) return null;
  const cost = typeof value.cost === "number" && !Number.isNaN(value.cost) ? value.cost : null;
  const durationMs =
    typeof value.durationMs === "number" && !Number.isNaN(value.durationMs)
      ? value.durationMs
      : null;
  if (cost == null && durationMs == null) return null;
  return { cost: cost ?? 0, durationMs: durationMs ?? 0 };
};
