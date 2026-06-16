import { ToolDefinition, ToolParams } from "../types";
import { TOOLS } from "../components/tools/tools-registry";
import { AUTO_ASPECT_RATIO, DEFAULT_CREATE_ASPECT_RATIO } from "./aspectRatios";

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

export const toolRequiresReferenceImage = (tool: ToolDefinition | null): boolean => {
  const mode = tool?.referenceImages ?? DEFAULT_REFERENCE_MODE;
  return getReferenceConstraints(mode).min > 0;
};
