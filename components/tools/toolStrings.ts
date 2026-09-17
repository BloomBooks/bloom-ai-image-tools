import { ToolDefinition, ToolParameter } from "../../types";
import { L10nFunc } from "../../lib/localization";
import { TOOLS } from "./tools-registry";

/**
 * The user-visible text a tool carries. Each string's localization ID is built from the
 * tool's own id, so the registry stays the one place the English is written.
 *
 * A parameter's `options` are deliberately not localized: those values are handed to the
 * tool's promptTemplate and reach the model, so translating them would change the prompt.
 */
export const toolTitle = (l10n: L10nFunc, tool: ToolDefinition): string =>
  l10n(`AiImageEditor.Tool.${tool.id}.Title`, tool.title);

export const toolDescription = (l10n: L10nFunc, tool: ToolDefinition): string =>
  l10n(`AiImageEditor.Tool.${tool.id}.Description`, tool.description);

export const toolActionButtonLabel = (l10n: L10nFunc, tool: ToolDefinition): string | undefined =>
  tool.actionButtonLabel
    ? l10n(`AiImageEditor.Tool.${tool.id}.ActionButton`, tool.actionButtonLabel)
    : undefined;

export const toolParameterLabel = (
  l10n: L10nFunc,
  tool: ToolDefinition,
  parameter: ToolParameter,
): string => l10n(`AiImageEditor.Tool.${tool.id}.Param.${parameter.name}`, parameter.label);

export const toolParameterPlaceholder = (
  l10n: L10nFunc,
  tool: ToolDefinition,
  parameter: ToolParameter,
): string | undefined =>
  parameter.placeholder
    ? l10n(
        `AiImageEditor.Tool.${tool.id}.Param.${parameter.name}.Placeholder`,
        parameter.placeholder,
      )
    : undefined;

/**
 * What a select option reads as. The stored value stays English, because it is what the
 * tool's promptTemplate sends to the model; only the text shown in the menu is translated.
 */
export const toolOptionLabel = (
  l10n: L10nFunc,
  tool: ToolDefinition,
  parameter: ToolParameter,
  option: string,
): string => l10n(`AiImageEditor.Tool.${tool.id}.Param.${parameter.name}.Option.${option}`, option);

/** Every tool string, keyed by the same IDs the helpers above ask for. */
export const collectToolStrings = (): Record<string, string> => {
  const strings: Record<string, string> = {};
  for (const tool of TOOLS) {
    strings[`AiImageEditor.Tool.${tool.id}.Title`] = tool.title;
    strings[`AiImageEditor.Tool.${tool.id}.Description`] = tool.description;
    if (tool.actionButtonLabel) {
      strings[`AiImageEditor.Tool.${tool.id}.ActionButton`] = tool.actionButtonLabel;
    }
    for (const parameter of tool.parameters) {
      strings[`AiImageEditor.Tool.${tool.id}.Param.${parameter.name}`] = parameter.label;
      if (parameter.placeholder) {
        strings[`AiImageEditor.Tool.${tool.id}.Param.${parameter.name}.Placeholder`] =
          parameter.placeholder;
      }
      if (parameter.type === "select") {
        for (const option of parameter.options ?? []) {
          strings[`AiImageEditor.Tool.${tool.id}.Param.${parameter.name}.Option.${option}`] =
            option;
        }
      }
    }
  }
  return strings;
};
