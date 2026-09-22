/**
 * Tool text that stays in English: the IDs of strings written as data in
 * `components/tools/tools-registry.ts`.
 *
 * Text written at an `l10n()` call site needs no entry here. It stays in English by being
 * a plain string, and gets wrapped in `l10n()` when it is ready to be translated. Tool text
 * has no call site to wrap: `toolStrings.ts` builds an ID for every title, description,
 * label, placeholder and menu option of every tool, so this list is the only way to say
 * that one of them is not ready. An ID here is left out of `ALL_IMAGE_EDITOR_STRINGS`, so
 * the host is never asked for it, and the English from the registry is shown.
 *
 * Every tool ID that is not here must have a `<trans-unit>` in one of Bloom's English XLF
 * files. To start translating one of these, take it out of this list and add its
 * `<trans-unit>` to the XLF file the developer picks.
 */
export const NOT_TRANSLATED = new Set<string>([
  // Tools and fields for whoever is preparing the artwork, not for the person writing the book.
  "AiImageEditor.Tool.break_comic_into_images.Description",
  "AiImageEditor.Tool.break_comic_into_images.Param.furtherInstructions.Placeholder",

  // Descriptions of two tools whose names are translated.
  "AiImageEditor.Tool.generate_pallet.Description",
  "AiImageEditor.Tool.pdf_to_images.Description",

  // The Change Ethnicity tool's character field and its menu of ethnicities.
  "AiImageEditor.Tool.ethnicity.Param.character.Placeholder",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Afro-Caribbean",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Asian (General)",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Australian Aboriginal",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Caucasian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Central Asian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.East Asian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Hispanic / Latino",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Indigenous Central American",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Indigenous North American",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Indigenous South American",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Melanesian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Micronesian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Middle Eastern",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Mixed / Multiracial",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.North African",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Polynesian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.South Asian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Southeast Asian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Sub-Saharan African – East African",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Sub-Saharan African – Southern African",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Sub-Saharan African – West African",
]);
