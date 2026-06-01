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

/** True when the model id is a Google model (OpenRouter-style "google/…" prefix). */
export const isGoogleModel = (modelId: string | null | undefined): boolean =>
  (modelId || "").trim().toLowerCase().startsWith("google/");

/** Preferred Google model when the Google provider is active. */
export const DEFAULT_GOOGLE_MODEL: ModelInfo | null =
  MODEL_CATALOG.find((model) => model.default && isGoogleModel(model.id)) ||
  MODEL_CATALOG.find((model) => isGoogleModel(model.id)) ||
  null;

export const getModelInfoById = (modelId: string | null | undefined) => {
  const id = (modelId || "").trim();
  if (!id) return null;
  return MODEL_CATALOG.find((model) => model.id === id) || null;
};

export const getModelNameById = (modelId: string | null | undefined) => {
  return getModelInfoById(modelId)?.name || null;
};
