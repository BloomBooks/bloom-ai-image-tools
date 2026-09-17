import type { ArtStyle } from "../types";
import { ART_STYLES } from "./artStyles";
import { L10nFunc } from "./localization";

/**
 * An art style's own text, with its localization ID built from the style's id so the
 * catalog (components/artStyle/art-styles.json5) stays the one place the English lives.
 * `promptDetail` is not localized: it goes to the model, not to the user.
 */
export const artStyleName = (l10n: L10nFunc, style: ArtStyle): string =>
  l10n(`AiImageEditor.ArtStyle.${style.id}.Name`, style.name);

export const artStyleDescription = (l10n: L10nFunc, style: ArtStyle): string =>
  style.description
    ? l10n(`AiImageEditor.ArtStyle.${style.id}.Description`, style.description)
    : "";

/** Every art style string, keyed by the same IDs the helpers above ask for. */
export const collectArtStyleStrings = (): Record<string, string> => {
  const strings: Record<string, string> = {};
  for (const style of ART_STYLES) {
    strings[`AiImageEditor.ArtStyle.${style.id}.Name`] = style.name;
    if (style.description) {
      strings[`AiImageEditor.ArtStyle.${style.id}.Description`] = style.description;
    }
  }
  return strings;
};
