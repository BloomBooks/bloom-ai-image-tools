import { L10nFunc } from "./localization";
import { MODEL_CATALOG } from "./modelsCatalog";

/**
 * The user-visible text the model registry carries: the small badge beside a model's name.
 *
 * A model's own name ("Gemini 3.1 Flash") is a product name and stays in English. Its price
 * line is not here either: `pricePerImageUsd` is a number, and the sentence around it is one
 * string with the amount as a parameter (`AiImageEditor.Model.AboutPerImage`), so no
 * translator ever carries a price that will change.
 *
 * Badges are shared by their text rather than keyed by model, because several models say the
 * same thing and because model keys come and go with each provider's lifecycle, which would
 * leave translated entries behind for keys nobody ships any more.
 */
const BADGE_IDS: Record<string, string> = {
  Great: "AiImageEditor.Model.Badge.Great",
  "Great but Expensive": "AiImageEditor.Model.Badge.GreatButExpensive",
};

export const modelBadgeId = (badge: string): string | undefined => BADGE_IDS[badge.trim()];

export const modelBadge = (l10n: L10nFunc, badge: string): string => {
  const id = modelBadgeId(badge);
  return id ? l10n(id, badge) : badge;
};

/** Every model string, keyed by the same IDs the helpers above ask for. */
export const collectModelStrings = (): Record<string, string> => {
  const strings: Record<string, string> = {};
  for (const model of MODEL_CATALOG) {
    const id = model.badge ? modelBadgeId(model.badge) : undefined;
    if (id && model.badge) {
      strings[id] = model.badge;
    }
  }
  return strings;
};
