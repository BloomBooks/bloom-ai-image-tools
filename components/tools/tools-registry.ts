import { ToolDefinition } from "../../types";
import {
  applyArtStyleToPrompt,
  DEFAULT_ART_STYLE_ID,
  getArtStyleById,
} from "../../lib/artStyles";
import {
  ETHNICITY_CATEGORIES,
  getEthnicityByValue,
} from "../../lib/ethnicities";

const ETHNICITY_OPTIONS = ETHNICITY_CATEGORIES.map(
  (category) => category.label
);
const DEFAULT_ETHNICITY_OPTION = ETHNICITY_OPTIONS[0] ?? "Asian (General)";

export const TOOLS: ToolDefinition[] = [
  {
    id: "generate_image",
    title: "New Image",
    description:
      "Generate a new image from scratch. You can provide reference images to guide the generation.",
    icon: "M12 4.5v15m7.5-7.5h-15", // Plus icon
    parameters: [
      {
        name: "prompt",
        label: "Image Description",
        type: "textarea",
        placeholder:
          "A cute robot playing chess in a park, children's book style",
      },
      {
        name: "styleId",
        label: "Style",
        type: "art-style",
        defaultValue: DEFAULT_ART_STYLE_ID,
        optional: true,
      },
    ],
    promptTemplate: (params) =>
      applyArtStyleToPrompt(params.prompt || "", params.styleId),
    referenceImages: "0+",
    editImage: false,
  },
  {
    id: "enhance_drawing",
    title: "Enhance Line Drawing",
    description: "Improve old, low-res line drawings",
    icon: "M3 18c4-8 8-8 18-12 M3 18h4 M17 6h4",
    parameters: [
      {
        name: "styleId",
        label: "New Style",
        type: "art-style",
        defaultValue: "cleanup-line-art",
        artStyleCategories: ["Line Art"],
        excludeNoneStyle: true,
      },
      {
        name: "extraInstructions",
        label: "Extra Instructions",
        type: "textarea",
        placeholder: "Add any extra instructions...",
        optional: true,
      },
    ],
    promptTemplate: (params) => {
      const styleId = params.styleId || "cleanup-line-art";
      const extraInstructions = params.extraInstructions?.trim();
      const basePrompt =
        "Transform this sketch into a polished illustration while keeping the exact composition, characters, and perspective. Clean up stray pencil marks, preserve the line work, and render it using the selected art direction.";
      const styledPrompt = applyArtStyleToPrompt(basePrompt, styleId);
      if (!extraInstructions) {
        return styledPrompt;
      }
      return `${styledPrompt}\n\nExtra instructions: ${extraInstructions}`;
    },
    referenceImages: "0",
  },
  {
    id: "change_text",
    title: "Change Text",
    description:
      "Replace specific text in the image. Use this to localize images that contain text.",
    icon: "M4 18l4-12 4 12 M5.2 14h5.6 M16 6h6 M16 12h6 M19 6v12",
    parameters: [
      {
        name: "match",
        label: "Text to Match",
        type: "text",
        placeholder: 'e.g. "Once upon a time"',
      },
      {
        name: "replace",
        label: "New Text",
        type: "text",
        placeholder: 'e.g. "In a galaxy far away"',
      },
    ],
    promptTemplate: (params) =>
      `Change the text "${params.match}" to "${params.replace}" in this image. Maintain the font style and background.`,
    referenceImages: "0",
  },
  {
    id: "change_style",
    title: "Change Style",
    description: "Restyle the selected image.",
    icon: "M3 21l10-10M11 7l3 3M15 4l5 5M17 2v4M21 4h-4",
    parameters: [
      {
        name: "styleId",
        label: "New Style",
        type: "art-style",
        defaultValue: DEFAULT_ART_STYLE_ID,
        excludeNoneStyle: true,
      },
    ],
    promptTemplate: (params) => {
      const selectedStyleId = params.styleId || DEFAULT_ART_STYLE_ID;
      const styleName =
        getArtStyleById(selectedStyleId)?.name || "the requested art direction";
      const base = `Re-render this image using ${styleName}. Preserve the exact composition, characters, and lighting cues while only changing the rendering technique.`;
      return applyArtStyleToPrompt(base, selectedStyleId);
    },
    referenceImages: "0",
  },

  {
    id: "stylized_title",
    title: "Add Stylized Title",
    description:
      "Add a stylized title overlay that fits well the illustration.",
    icon: "M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z M12 2h3.5a3.5 3.5 0 0 1 3.5 3.5v11.5A3.5 3.5 0 0 1 15.5 22H12V2z",
    parameters: [
      {
        name: "title",
        label: "Title Text",
        type: "text",
        placeholder: "The Big Adventure",
      },
      {
        name: "style",
        label: "Style",
        type: "select",
        options: ["Playful", "Gothic", "Handwritten", "Neon", "Storybook"],
        defaultValue: "Storybook",
      },
    ],
    promptTemplate: (params) =>
      `Add a stylized title "${params.title}" to this image. Use a ${params.style} font style that fits a children's book.`,
    referenceImages: "0",
  },

  {
    id: "ethnicity",
    title: "Change Ethnicity",
    description: "Modify character ethnicity.",
    icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
    parameters: [
      {
        name: "ethnicity",
        label: "Ethnicity",
        type: "select",
        options: ETHNICITY_OPTIONS,
        defaultValue: DEFAULT_ETHNICITY_OPTION,
      },
      {
        name: "character",
        label: "Target Character",
        type: "text",
        placeholder: "e.g. the boy, the girl",
        optional: true,
      },
    ],
    promptTemplate: (params) => {
      const character = params.character?.trim() || "the main character";
      const selectedEthnicity =
        getEthnicityByValue(params.ethnicity) ??
        ETHNICITY_CATEGORIES[0] ??
        null;
      const label =
        selectedEthnicity?.label ||
        params.ethnicity?.trim() ||
        "the requested ethnicity";
      const description = selectedEthnicity?.description?.trim();
      const ethnicityDetails = description
        ? `${label}. Appearance cues: ${description}`
        : label;

      return `Change the ethnicity of ${character} to ${ethnicityDetails}. Maintain the pose, clothing, and art style.  Do not put the people traditional clothing unless the original image had that. Just show them in everyday clothes common to this region, unless I direct you otherwise.`;
    },
    referenceImages: "0",
  },
  {
    id: "custom",
    title: "Custom Edit",
    description: "Edit the image, optionally with additional reference images.",
    icon: "M4 4h8l2 2h6v14H4z M9 13l3 3 4-4",
    parameters: [
      {
        name: "prompt",
        label: "Instructions",
        type: "textarea",
        placeholder: "Describe how to change the image...",
      },
    ],
    promptTemplate: (params) => params.prompt,
    referenceImages: "0+",
  },
  {
    id: "remove_object",
    title: "Remove Object",
    description: "Remove unwanted objects or artifacts.",
    icon: "M20 20.5l-3.2-3.2 M15.5 10l-1 5 4.5-1.5 3.5 2.5-1.5-4.5 2.5-3.5-5 1z M5 16l-1 5 4.5-1.5 3.5 2.5-1.5-4.5 2.5-3.5-5 1z M9.5 4l-1 5 4.5-1.5 3.5 2.5-1.5-4.5 2.5-3.5-5 1z",
    parameters: [
      {
        name: "target",
        label: "Object to Remove",
        type: "text",
        placeholder: "e.g. the red ball, background clutter",
      },
    ],
    promptTemplate: (params) =>
      `Clean up the image by removing ${params.target}. Infill the area naturally to match the surrounding background.`,
    referenceImages: "0",
  },
  {
    id: "remove_background",
    title: "Remove Background",
    description: "Isolate the subject on a transparent background.",
    icon: "M15 4V2m0 18v2M4 15H2m18 0h2 M6.3 7.7L3.5 4.9m15.6 15.6l-2.8-2.8 M6.3 17.7L3.5 20.5m15.6-15.6l-2.8 2.8 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", // Dashed circleish
    parameters: [],
    promptTemplate: () =>
      `Remove the background from the image, leaving the main subject isolated on a transparent background.`,
    referenceImages: "0",
    capabilities: { "transparent-background": true },
  },
];
