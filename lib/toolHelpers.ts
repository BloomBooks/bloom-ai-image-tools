import { CapabilityName, ModelInfo, ToolDefinition, ToolParams } from "../types";
import { TOOLS } from "../components/tools/tools-registry";
import { AUTO_ASPECT_RATIO, DEFAULT_CREATE_ASPECT_RATIO } from "./aspectRatios";

export type ReferenceMode = ToolDefinition["referenceImages"];

const DEFAULT_REFERENCE_MODE: ReferenceMode = "0";
const CAPABILITY_READY_SCORE = 3;

const normalizeId = (id: string | null | undefined): string => (id || "").trim().toLowerCase();

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
  const configuredValue = params?.aspectRatio?.trim();
  if (configuredValue) {
    return configuredValue;
  }

  const hiddenDefault = tool?.hiddenAspectRatioDefault?.trim();
  if (hiddenDefault) {
    return hiddenDefault;
  }

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

export const getRequiredCapabilities = (tool: ToolDefinition | null): CapabilityName[] => {
  if (!tool?.capabilities) {
    return [];
  }
  return Object.entries(tool.capabilities)
    .filter(([, required]) => !!required)
    .map(([capability]) => capability);
};

export const isOllamaOrLocal = (model: ModelInfo | null): boolean => {
  const normalized = normalizeId(model?.id);
  if (!normalized) {
    return false;
  }
  return (
    normalized.startsWith("ollama/") ||
    normalized.startsWith("local/") ||
    normalized.includes(":local") ||
    normalized.startsWith("ollama-")
  );
};

export const hasRequiredCapabilities = (
  tool: ToolDefinition | null,
  model: ModelInfo | null,
): boolean => {
  const required = getRequiredCapabilities(tool);
  if (!required.length) {
    return true;
  }

  if (!model) {
    return true;
  }

  if (isOllamaOrLocal(model)) {
    return true;
  }

  const scores = model.capabilities;
  if (!scores) {
    return true;
  }

  return required.every((capability) => {
    const score = scores[capability];
    if (typeof score !== "number") {
      return true;
    }
    return score >= CAPABILITY_READY_SCORE;
  });
};
