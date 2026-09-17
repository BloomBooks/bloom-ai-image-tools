import { collectToolStrings } from "../components/tools/toolStrings";
import { collectArtStyleStrings } from "./artStyleStrings";
import { STATIC_IMAGE_EDITOR_STRINGS } from "./staticStrings";

/**
 * Every user-visible string in the editor, keyed by localization ID with English as the
 * default value. The editor hands this to the host's `getLocalizations` on mount, so the
 * host can fetch all of the translations in one round-trip.
 *
 * The tools' own text (titles, descriptions, parameter labels) and the art styles' names
 * and descriptions are read off their catalogs rather than written out again here;
 * `components/tools/toolStrings.ts` and `lib/artStyleStrings.ts` build the same IDs their
 * UI asks for.
 */
export const ALL_IMAGE_EDITOR_STRINGS: Record<string, string> = {
  ...STATIC_IMAGE_EDITOR_STRINGS,
  ...collectToolStrings(),
  ...collectArtStyleStrings(),
};
