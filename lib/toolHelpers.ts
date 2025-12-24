import { CapabilityName, ModelInfo, ToolDefinition } from "../types";
import { TOOLS } from "../components/tools/tools-registry";

export type ReferenceMode = ToolDefinition["referenceImages"];

const DEFAULT_REFERENCE_MODE: ReferenceMode = "0";
const CAPABILITY_READY_SCORE = 3;

const normalizeId = (id: string | null | undefined): string =>
  (id || "").trim().toLowerCase();

export const getToolById = (toolId: string | null): ToolDefinition | null => {
  if (!toolId) {
    return null;
  }
  return TOOLS.find((tool) => tool.id === toolId) ?? null;
};

export const getToolReferenceMode = (
  toolId: string | null
): ReferenceMode => {
  const tool = getToolById(toolId);
  return tool?.referenceImages ?? DEFAULT_REFERENCE_MODE;
};

export const getReferenceConstraints = (
  mode: ReferenceMode
): { min: number; max: number } => {
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

export const toolRequiresEditImage = (
  tool: ToolDefinition | null
): boolean => {
  if (!tool) {
    return false;
  }
  return tool.editImage !== false;
};

export const toolRequiresReferenceImage = (
  tool: ToolDefinition | null
): boolean => {
  const mode = tool?.referenceImages ?? DEFAULT_REFERENCE_MODE;
  return getReferenceConstraints(mode).min > 0;
};

export const getRequiredCapabilities = (
  tool: ToolDefinition | null
): CapabilityName[] => {
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
  model: ModelInfo | null
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
