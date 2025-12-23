import { ToolParamsById } from "../../types";
import { TOOLS } from "./tools-registry";

const buildDefaults = (): ToolParamsById => {
  const defaults: ToolParamsById = {};
  TOOLS.forEach((tool) => {
    const toolDefaults: Record<string, string> = {};
    tool.parameters.forEach((param) => {
      if (typeof param.defaultValue === "string") {
        toolDefaults[param.name] = param.defaultValue;
      } else if (param.type === "select" && param.options?.length) {
        toolDefaults[param.name] = param.options[0];
      } else {
        toolDefaults[param.name] = "";
      }
    });
    defaults[tool.id] = toolDefaults;
  });
  return defaults;
};

export const createToolParamDefaults = (): ToolParamsById => buildDefaults();

export const mergeParamsWithDefaults = (
  existing?: ToolParamsById
): ToolParamsById => {
  const defaults = buildDefaults();
  if (!existing) return defaults;

  const merged: ToolParamsById = {};
  Object.keys(defaults).forEach((toolId) => {
    merged[toolId] = {
      ...defaults[toolId],
      ...(existing[toolId] || {}),
    };
  });
  return merged;
};
