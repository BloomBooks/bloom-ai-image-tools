import { ToolDefinition, ToolParameter } from "../../types";
import { L10nFunc } from "../../lib/localization";
import { TOOLS } from "./tools-registry";
import { NOT_TRANSLATED } from "../../lib/untranslated";

/**
 * The user-visible text a tool carries. Each string's localization ID is built from the
 * tool's own id, so the registry stays the one place the English is written.
 *
 * Two rules keep one sentence from being sent for translation twice, which would cost a
 * translator the work and let the copies drift apart:
 *
 * - Text several tools share (every tool's "Further Instructions" field, "Shape", "Size")
 *   is listed in SHARED_IDS below and carries one ID for all of them.
 * - A tool whose action button repeats its title (Make GIF, Improve Drawing) reuses the
 *   title's ID instead of adding a second one.
 *
 * A parameter's `options` keep their English *values*: those are handed to the tool's
 * promptTemplate and reach the model. Only the text shown in the menu is translated, and
 * an option that is a bare number is not translated at all.
 *
 * `lib/__tests__/staticStrings.test.ts` fails if a new string slips past any of that.
 */

/** English that is not a string to translate: a number, a ratio, a bare symbol. */
export const isUntranslatable = (text: string): boolean => !/\p{Letter}/u.test(text);

/**
 * Text used in more than one place, with the single ID they all share. Keyed by the
 * English exactly as the registry writes it.
 */
const SHARED_IDS: Record<string, string> = {
  "Further Instructions": "AiImageEditor.Param.FurtherInstructions",
  Instructions: "AiImageEditor.Param.Instructions",
  Shape: "AiImageEditor.Param.Shape",
  Size: "AiImageEditor.Param.Size",
  Style: "AiImageEditor.Param.Style",
  "Add any extra instructions...": "AiImageEditor.Param.AddExtraInstructions",
};

/** The translation of `english`, or `english` itself when this ID is not translated. */
const say = (l10n: L10nFunc, id: string, english: string): string =>
  NOT_TRANSLATED.has(id) ? english : l10n(id, english);

const sharedId = (english: string): string | undefined => SHARED_IDS[english.trim()];

const sameText = (a: string | undefined, b: string | undefined): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export const toolTitleId = (tool: ToolDefinition): string => `AiImageEditor.Tool.${tool.id}.Title`;

export const toolTitle = (l10n: L10nFunc, tool: ToolDefinition): string =>
  say(l10n, toolTitleId(tool), tool.title);

export const toolDescription = (l10n: L10nFunc, tool: ToolDefinition): string =>
  tool.description?.trim()
    ? say(l10n, `AiImageEditor.Tool.${tool.id}.Description`, tool.description)
    : "";

export const toolActionButtonLabel = (l10n: L10nFunc, tool: ToolDefinition): string | undefined => {
  if (!tool.actionButtonLabel) {
    return undefined;
  }
  // "Make GIF" on the button and "Make GIF" in the tool list is one string, not two.
  if (sameText(tool.actionButtonLabel, tool.title)) {
    return say(l10n, toolTitleId(tool), tool.title);
  }
  return say(l10n, `AiImageEditor.Tool.${tool.id}.ActionButton`, tool.actionButtonLabel);
};

export const toolParameterLabelId = (tool: ToolDefinition, parameter: ToolParameter): string =>
  sharedId(parameter.label) ?? `AiImageEditor.Tool.${tool.id}.Param.${parameter.name}`;

export const toolParameterLabel = (
  l10n: L10nFunc,
  tool: ToolDefinition,
  parameter: ToolParameter,
): string => say(l10n, toolParameterLabelId(tool, parameter), parameter.label);

export const toolParameterPlaceholderId = (
  tool: ToolDefinition,
  parameter: ToolParameter,
): string =>
  sharedId(parameter.placeholder ?? "") ??
  `AiImageEditor.Tool.${tool.id}.Param.${parameter.name}.Placeholder`;

export const toolParameterPlaceholder = (
  l10n: L10nFunc,
  tool: ToolDefinition,
  parameter: ToolParameter,
): string | undefined =>
  parameter.placeholder
    ? say(l10n, toolParameterPlaceholderId(tool, parameter), parameter.placeholder)
    : undefined;

export const toolOptionId = (
  tool: ToolDefinition,
  parameter: ToolParameter,
  option: string,
): string =>
  sharedId(option) ?? `AiImageEditor.Tool.${tool.id}.Param.${parameter.name}.Option.${option}`;

export const toolOptionLabel = (
  l10n: L10nFunc,
  tool: ToolDefinition,
  parameter: ToolParameter,
  option: string,
): string =>
  isUntranslatable(option) ? option : say(l10n, toolOptionId(tool, parameter, option), option);

/** Every tool string, keyed by the same IDs the helpers above ask for. */
export const collectToolStrings = (): Record<string, string> => {
  const strings: Record<string, string> = {};
  const add = (id: string, english: string | undefined) => {
    if (english && english.trim() && !isUntranslatable(english) && !NOT_TRANSLATED.has(id)) {
      strings[id] = english;
    }
  };

  for (const tool of TOOLS) {
    add(toolTitleId(tool), tool.title);
    add(`AiImageEditor.Tool.${tool.id}.Description`, tool.description);
    if (tool.actionButtonLabel && !sameText(tool.actionButtonLabel, tool.title)) {
      add(`AiImageEditor.Tool.${tool.id}.ActionButton`, tool.actionButtonLabel);
    }
    for (const parameter of tool.parameters) {
      add(toolParameterLabelId(tool, parameter), parameter.label);
      if (parameter.placeholder) {
        add(toolParameterPlaceholderId(tool, parameter), parameter.placeholder);
      }
      if (parameter.type === "select") {
        for (const option of parameter.options ?? []) {
          add(toolOptionId(tool, parameter, option), option);
        }
      }
    }
  }
  return strings;
};
