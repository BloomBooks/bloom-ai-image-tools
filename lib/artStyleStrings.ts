import type { ArtStyle } from "../types";
import { ART_STYLES } from "./artStyles";
import { L10nFunc } from "./localization";
import { isUntranslatable } from "../components/tools/toolStrings";

/** The "None" entry names the same idea the reasoning/quality menus call "None". */
const SHARED_IDS: Record<string, string> = {
  None: "AiImageEditor.Level.None",
};

export const artStyleNameId = (style: ArtStyle): string =>
  SHARED_IDS[style.name.trim()] ?? `AiImageEditor.ArtStyle.${style.id}.Name`;

/** A description that only repeats the style's own name is not a second string. */
const describable = (style: ArtStyle): string =>
  style.description &&
  style.description.trim().toLowerCase() !== style.name.trim().toLowerCase() &&
  !isUntranslatable(style.description)
    ? style.description
    : "";

/**
 * An art style's own text, with its localization ID built from the style's id so the
 * catalog (components/artStyle/art-styles.json5) stays the one place the English lives.
 * `promptDetail` is not localized: it goes to the model, not to the user.
 */
export const artStyleName = (l10n: L10nFunc, style: ArtStyle): string =>
  l10n(artStyleNameId(style), style.name);

/**
 * An art style's explanatory line, in English always.
 *
 * Deliberately not localized and deliberately absent from ALL_IMAGE_EDITOR_STRINGS: 28 long
 * sentences about drawing styles are worth more of a translator's time than they return, and
 * English inside a French interface is worse than nothing. The chooser shows these only when
 * `useIsEnglishUi()` is true.
 */
export const artStyleDescription = (style: ArtStyle): string => describable(style);

/** Every art style string, keyed by the same IDs the helpers above ask for. */
export const collectArtStyleStrings = (): Record<string, string> => {
  const strings: Record<string, string> = {};
  for (const style of ART_STYLES) {
    if (style.name.trim() && !isUntranslatable(style.name)) {
      strings[artStyleNameId(style)] = style.name;
    }
  }
  return strings;
};
