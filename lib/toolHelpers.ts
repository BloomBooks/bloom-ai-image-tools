import { ToolDefinition, ToolParams } from "../types";
import { TOOLS } from "../components/tools/tools-registry";
import { AUTO_ASPECT_RATIO, DEFAULT_CREATE_ASPECT_RATIO } from "./aspectRatios";
import { LOCAL_DUMMY_MODEL_ID } from "./localModels";

export type ReferenceMode = ToolDefinition["referenceImages"];

const DEFAULT_REFERENCE_MODE: ReferenceMode = "0";

export const getToolById = (toolId: string | null): ToolDefinition | null => {
  if (!toolId) {
    return null;
  }
  return TOOLS.find((tool) => tool.id === toolId) ?? null;
};

export const getToolReferenceMode = (toolId: string | null): ReferenceMode => {
  const tool = getToolById(toolId);
  return tool?.referenceImages ?? DEFAULT_REFERENCE_MODE;
};

export const getReferenceConstraints = (mode: ReferenceMode): { min: number; max: number } => {
  switch (mode) {
    case "0":
      return { min: 0, max: 0 };
    case "0+":
      return { min: 0, max: Number.POSITIVE_INFINITY };
    case "1":
      return { min: 1, max: 1 };
    case "1+":
      return { min: 1, max: Number.POSITIVE_INFINITY };
    default:
      return { min: 0, max: 0 };
  }
};

export const toolRequiresEditImage = (tool: ToolDefinition | null): boolean => {
  if (!tool) {
    return false;
  }
  return tool.editImage !== false;
};

export const getRequestedAspectRatioValue = (
  tool: ToolDefinition | null,
  params: ToolParams | null | undefined,
): string => {
  // A hidden default outranks params: tools that declare one have no shape
  // picker, so any params.aspectRatio is a stale leftover persisted from
  // before the picker was hidden for that tool.
  const hiddenDefault = tool?.hiddenAspectRatioDefault?.trim();
  if (hiddenDefault) {
    return hiddenDefault;
  }

  const configuredValue = params?.aspectRatio?.trim();
  if (configuredValue) {
    return configuredValue;
  }

  // A tool with a shape picker carries its own default in `parameters` — that
  // is where Create an Image's Auto (the book slot's shape) comes from — and
  // params normally holds it already. This matters for a caller that passes
  // params without one: reading the tool's default keeps its shape from
  // silently becoming a square.
  const declaredDefault = tool?.parameters
    ?.find((parameter) => parameter.name === "aspectRatio")
    ?.defaultValue?.trim();
  if (declaredDefault) {
    return declaredDefault;
  }

  // Nothing to take a shape from: a tool that makes a picture from scratch
  // makes a square, an edit follows its source.
  return tool?.editImage === false ? DEFAULT_CREATE_ASPECT_RATIO : AUTO_ASPECT_RATIO;
};

export const getRequestedImageSizeValue = (
  tool: ToolDefinition | null,
  params: ToolParams | null | undefined,
  targetResolution?: { width: number; height: number } | null,
): string | undefined => {
  const configuredValue = params?.size?.trim();
  if (configuredValue) {
    return configuredValue;
  }

  if (!tool || tool.editImage === false || !targetResolution) {
    return undefined;
  }

  const longEdge = Math.max(targetResolution.width || 0, targetResolution.height || 0);
  if (longEdge > 2048) {
    return "4k";
  }

  if (longEdge > 1024) {
    return "2k";
  }

  return "1k";
};

export const toolRequiresReferenceImage = (tool: ToolDefinition | null): boolean => {
  const mode = tool?.referenceImages ?? DEFAULT_REFERENCE_MODE;
  return getReferenceConstraints(mode).min > 0;
};

export const toolSupportsBatch = (tool: ToolDefinition | null | undefined): boolean =>
  Boolean(tool?.allowBatch);

/**
 * Whether running this tool on this model would send a request to OpenRouter, and so
 * cost the user money. False for the tools that run in the browser (background removal,
 * PDF import) and for the local dummy model.
 */
export const toolRunCallsOpenRouter = (
  tool: ToolDefinition | null | undefined,
  modelId: string | null | undefined,
): boolean => {
  if (!tool) return false;
  if (tool.id === "remove_background" || tool.localOnly) return false;
  return (modelId || "").trim() !== LOCAL_DUMMY_MODEL_ID;
};
