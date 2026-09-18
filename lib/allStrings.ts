import { collectToolStrings } from "../components/tools/toolStrings";
import { collectArtStyleStrings } from "./artStyleStrings";
import { collectModelStrings } from "./modelStrings";
import { collectStripStrings } from "./thumbnailStrips";
import { STATIC_IMAGE_EDITOR_STRINGS } from "./staticStrings";
import { LOOK_AROUND_MODE_MESSAGE, LOOK_AROUND_MODE_MESSAGE_ID } from "./lookAroundMode";
import { NOT_TRANSLATED } from "./untranslated";

/**
 * Every user-visible string in the editor, keyed by localization ID with English as the
 * default value. The editor hands this to the host's `getLocalizations` on mount, so the
 * host can fetch all of the translations in one round-trip.
 *
 * The tools' own text (titles, descriptions, parameter labels) and the art styles' names
 * and descriptions are read off their catalogs rather than written out again here;
 * `components/tools/toolStrings.ts` and `lib/artStyleStrings.ts` build the same IDs their
 * UI asks for.
 *
 * The IDs in `NOT_TRANSLATED` are left out: Bloom keeps those in English, so asking for
 * them would put work in front of a translator that nobody wants done.
 */
export const ALL_IMAGE_EDITOR_STRINGS: Record<string, string> = Object.fromEntries(
  Object.entries({
    ...STATIC_IMAGE_EDITOR_STRINGS,
    // Passed to l10n() through constants, so the call-site scan in
    // dev/generateStaticStrings.mjs cannot see it.
    [LOOK_AROUND_MODE_MESSAGE_ID]: LOOK_AROUND_MODE_MESSAGE,
    ...collectToolStrings(),
    ...collectArtStyleStrings(),
    ...collectModelStrings(),
    ...collectStripStrings(),
  }).filter(([id]) => !NOT_TRANSLATED.has(id)),
);
