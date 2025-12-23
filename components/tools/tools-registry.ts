import { ToolDefinition } from "../../types";
import {
  applyArtStyleToPrompt,
  CLEAR_ART_STYLE_ID,
  DEFAULT_ART_STYLE_ID,
  getArtStyleById,
  isClearArtStyleId,
} from "../../lib/artStyles";

export const TOOLS: ToolDefinition[] = [
  {
    id: "generate_image",
    title: "New Image",
    description: "Generate a new image from scratch (optional reference).",
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
    icon: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
    parameters: [
      {
        name: "styleId",
        label: "New Style",
        type: "art-style",
        defaultValue: CLEAR_ART_STYLE_ID,
        artStyleCategories: ["Line Art"],
      },
    ],
    promptTemplate: (params) => {
      const styleId = params.styleId || CLEAR_ART_STYLE_ID;
      const cleared = isClearArtStyleId(styleId);
      const basePrompt = cleared
        ? "Transform this rough sketch into a high-quality, professional black and white line drawing. Make the lines crisp, smooth, and confident. Remove any sketchiness, eraser marks, or noise so the result is press-ready ink art."
        : "Transform this sketch into a polished illustration while keeping the exact composition, characters, and perspective. Clean up stray pencil marks, preserve the line work, and render it using the selected art direction.";
      return applyArtStyleToPrompt(basePrompt, styleId);
    },
    referenceImages: "0",
  },
  {
    id: "change_text",
    title: "Change Text",
    description: "Replace specific text in the image.",
    icon: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
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
    description: "Restyle the selected image with a curated art direction.",
    icon: "M12 20l9-16M5 15h7",
    parameters: [
      {
        name: "styleId",
        label: "New Style",
        type: "art-style",
        defaultValue: DEFAULT_ART_STYLE_ID,
      },
    ],
    promptTemplate: (params) => {
      const selectedStyleId = params.styleId || DEFAULT_ART_STYLE_ID;
      const cleared = isClearArtStyleId(selectedStyleId);
      const effectiveStyleId = cleared ? CLEAR_ART_STYLE_ID : selectedStyleId;
      const styleName = cleared
        ? "no additional art style"
        : getArtStyleById(effectiveStyleId)?.name ||
          "the requested art direction";
      const base = cleared
        ? "Re-render this image without applying any new art style. Preserve the exact composition, characters, lighting cues, and rendering approach."
        : `Re-render this image using ${styleName}. Preserve the exact composition, characters, and lighting cues while only changing the rendering technique.`;
      return applyArtStyleToPrompt(base, effectiveStyleId);
    },
    referenceImages: "0",
  },

  {
    id: "stylized_title",
    title: "Add Stylized Title",
    description: "Add a stylized title overlay that matches the illustration.",
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
    description: "Modify character ethnicity/style.",
    icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
    parameters: [
      {
        name: "ethnicity",
        label: "Ethnicity/Style",
        type: "select",
        options: [
          "Asian",
          "Black",
          "Hispanic",
          "Caucasian",
          "Middle Eastern",
          "South Asian",
          "Indigenous",
        ],
        defaultValue: "Asian",
      },
      {
        name: "character",
        label: "Target Character",
        type: "text",
        placeholder: "e.g. the boy, the girl",
        optional: true,
      },
    ],
    promptTemplate: (params) =>
      `Change the ethnicity of ${params.character || "the main character"} to ${
        params.ethnicity
      }. Maintain the pose, clothing, and art style.`,
    referenceImages: "0",
  },
  {
    id: "custom",
    title: "Custom Edit",
    description: "Edit the image, optionally with additional reference images.",
    icon: "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z M12 6v6l4 2",
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
