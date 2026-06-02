import JSON5 from "json5";
import modelCatalogText from "../data/models-registry.json5";
import type { ModelInfo } from "../types";
import { withLocalModels } from "./localModels";

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
