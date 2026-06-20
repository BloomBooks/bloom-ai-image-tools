import JSON5 from "json5";
import modelCatalogText from "../data/models-registry.json5";
import type { MeasuredStats, ModelInfo, ModelReasoningLevel, ToolDefinition } from "../types";
import { LOCAL_DUMMY_MODEL_ID, withLocalModels } from "./localModels";
import { DEFAULT_SIZE_TOKEN } from "./imageSizes";

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
// with the catalog default (Gemini 3.1 Flash) recommended.
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
  // withLocalModels). Where it exists, offer it on every tool (unless the tool
  // explicitly disallows it) as a no-network engine for UI testing.
  if (
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
 */
export const resolveToolReasoningLevel = (
  tool: ToolDefinition,
  model: ModelInfo | null,
  reasoningByTool?: Record<string, ModelReasoningLevel>,
): ModelReasoningLevel => {
  const override = reasoningByTool?.[tool.id];
  if (isModelReasoningLevel(override)) {
    return override;
  }
  if (isModelReasoningLevel(tool.imageReasoningLevel)) {
    return tool.imageReasoningLevel;
  }
  if (isModelReasoningLevel(model?.initialReasoningLevel)) {
    return model.initialReasoningLevel;
  }
  return "default";
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
