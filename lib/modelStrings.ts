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

/**
 * The ID for one model's description, which the picker shows as the tooltip on its row.
 *
 * Unlike a badge, a description belongs to the one model it is about, so it is keyed by the
 * model's own OpenRouter key with the punctuation that key carries ("/", ".") flattened,
 * since a localization ID is read as dot-separated parts.
 */
export const modelDescriptionId = (modelId: string): string =>
  `AiImageEditor.Model.${modelId.trim().replace(/[^A-Za-z0-9]+/g, "-")}.Description`;

export const modelDescription = (l10n: L10nFunc, model: { id: string; description?: string }) => {
  const english = model.description?.trim();
  return english ? l10n(modelDescriptionId(model.id), english) : "";
};

/** Every model string, keyed by the same IDs the helpers above ask for. */
export const collectModelStrings = (): Record<string, string> => {
  const strings: Record<string, string> = {};
  for (const model of MODEL_CATALOG) {
    const id = model.badge ? modelBadgeId(model.badge) : undefined;
    if (id && model.badge) {
      strings[id] = model.badge;
    }
    const description = model.description?.trim();
    if (description) {
      strings[modelDescriptionId(model.id)] = description;
    }
  }
  return strings;
};
