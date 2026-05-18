import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import CallSplitOutlinedIcon from "@mui/icons-material/CallSplitOutlined";
import ColorLensOutlinedIcon from "@mui/icons-material/ColorLensOutlined";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";
import CropFreeOutlinedIcon from "@mui/icons-material/CropFreeOutlined";
import Diversity3OutlinedIcon from "@mui/icons-material/Diversity3Outlined";
import GifBoxOutlinedIcon from "@mui/icons-material/GifBoxOutlined";
import TextFieldsOutlinedIcon from "@mui/icons-material/TextFieldsOutlined";
import TitleOutlinedIcon from "@mui/icons-material/TitleOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import { ToolDefinition, ToolParameter } from "../../types";
import {
  applyArtStyleToPrompt,
  DEFAULT_ART_STYLE_ID,
  getArtStyleById,
} from "../../lib/artStyles";
import {
  AUTO_ASPECT_RATIO,
  DEFAULT_CREATE_ASPECT_RATIO,
  getAspectRatioPromptHint,
} from "../../lib/aspectRatios";
import {
  ETHNICITY_CATEGORIES,
  getEthnicityByValue,
} from "../../lib/ethnicities";

const ETHNICITY_OPTIONS = ETHNICITY_CATEGORIES.map(
  (category) => category.label,
);
const DEFAULT_ETHNICITY_OPTION = ETHNICITY_OPTIONS[0] ?? "Asian (General)";
const SIZE_OPTIONS = ["512k", "1k", "2k", "4k"] as const;
const DEFAULT_SIZE = SIZE_OPTIONS[0];
const SIZE_HINTS: Record<string, string> = {
  "512k": "512k image preset (uses the provider's lowest supported Gemini image-size tier).",
  "1k": "1k image (1024px on the long edge.)",
  "2k": "2k image (2048px on the long edge.)",
  "4k": "4k image (4096px on the long edge.)",
};

const PALETTE_COLOR_OPTIONS = ["3", "4", "5", "6", "7"] as const;

const createAspectRatioParameter = (defaultValue: string): ToolParameter => ({
  name: "aspectRatio",
  label: "Aspect Ratio",
  type: "aspect-ratio",
  defaultValue,
});

const shouldExposeAspectRatio = (tool: ToolDefinition) =>
  tool.outputType !== "text" && tool.id !== "remove_background";

const appendOptionalInstructions = (
  basePrompt: string,
  extraInstructions: string | undefined,
  prefix: string,
) => {
  const trimmedInstructions = extraInstructions?.trim();
  if (!trimmedInstructions) {
    return basePrompt;
  }

  return `${basePrompt}\n\n${prefix} ${trimmedInstructions}`;
};

export const TOOLS: ToolDefinition[] = [
  {
    id: "generate_image",
    title: "Create an Image",
    description: "",
    icon: AddPhotoAlternateOutlinedIcon,
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
      {
        ...createAspectRatioParameter(DEFAULT_CREATE_ASPECT_RATIO),
      },
      {
        name: "size",
        label: "Size",
        type: "size",
        options: [...SIZE_OPTIONS],
        defaultValue: DEFAULT_SIZE,
      },
    ],
    promptTemplate: (params) => {
      const promptText = (params.prompt || "").trim();
      const basePrompt = promptText || "Create a new illustration.";
      const aspectRatioHint = getAspectRatioPromptHint(params.aspectRatio);
      const selectedSize = (params.size && params.size.trim()) || DEFAULT_SIZE;
      const sizeHint = SIZE_HINTS[selectedSize] || SIZE_HINTS[DEFAULT_SIZE];
      const noTextReminder =
        "Do not add any frame, no lettering or typography unless the description explicitly requests text.";
      const combinedPrompt = `${basePrompt}\n\n${aspectRatioHint} ${sizeHint} ${noTextReminder}`;
      return applyArtStyleToPrompt(combinedPrompt, params.styleId);
    },
    referenceImages: "0+",
    editImage: false,
  },
  {
    id: "break_into_pieces",
    title: "Break into Pieces",
    description:
      "Turn one or more reference images into a clean sheet of separate game pieces.",
    icon: CallSplitOutlinedIcon,
    parameters: [
      {
        name: "furtherInstructions",
        label: "Further Instructions",
        type: "textarea",
        placeholder:
          "Optional: mention what to include, what to skip, or how toy-like the pieces should feel.",
        optional: true,
      },
    ],
    promptTemplate: (params) => {
      const basePrompt =
        "Using the supplied reference image or images, design a clean sheet of separate game pieces derived from the visible characters, props, animals, and important objects. Convert the source into distinct standalone pieces that would be useful for a board game or storytelling game. Arrange the finished pieces in a tidy grid on a pure white background with generous spacing between items. Keep every piece fully visible and clearly separated from the others. No borders, no frames, no cut lines, no shadows, no labels, no captions, no numbering, and no extra scene background. Preserve the source design language, colors, and recognizable details while simplifying only as needed so each piece reads clearly as an individual cutout.";
      return appendOptionalInstructions(
        basePrompt,
        params.furtherInstructions,
        "Additional instructions to follow closely:",
      );
    },
    actionButtonLabel: "Generate Pieces",
    referenceImages: "1+",
    editImage: false,
    derivedResultMode: "split-images",
  },
  {
    id: "make_gif",
    title: "Make Gif",
    description:
      "Turn one reference image into a short looping animation sheet and encode it as a GIF.",
    icon: GifBoxOutlinedIcon,
    parameters: [
      {
        name: "animationDescription",
        label: "Describe the Animation",
        type: "textarea",
        placeholder:
          "Optional: describe the motion, such as blinking, waving, hopping, or turning around.",
        optional: true,
      },
    ],
    promptTemplate: (params) => {
      const basePrompt =
        "Using the supplied reference image, create a clean animation sprite sheet of 8 sequential frames for the same main subject. Keep the character or object recognizable and consistent from frame to frame, with the same design language, camera angle, scale, and lighting. Arrange the 8 frames in reading order on a pure white background with generous spacing so each frame can be separated cleanly. Each frame must show a different moment in one short looping action. No borders, no panels, no captions, no text, no frame numbers, no arrows, no motion trails, and no extra scene background. The animation should work as transparent cutout frames after the white background is removed.";
      return appendOptionalInstructions(
        basePrompt,
        params.animationDescription,
        "Animate this specific action:",
      );
    },
    actionButtonLabel: "Make GIF",
    referenceImages: "1",
    editImage: false,
    derivedResultMode: "animated-gif",
  },
  {
    id: "enhance_drawing",
    title: "Enhance Line Drawing",
    description: "Improve old, low-res line drawings",
    icon: AutoFixHighOutlinedIcon,
    parameters: [
      {
        name: "styleId",
        label: "",
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
    referenceImages: "0+",
  },
  {
    id: "change_text",
    title: "Change Text",
    description:
      "Replace specific text in the image. Use this to localize images that contain text.",
    icon: TextFieldsOutlinedIcon,
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
    icon: BrushOutlinedIcon,
    parameters: [
      {
        name: "styleId",
        label: "",
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
    icon: TitleOutlinedIcon,
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
    icon: Diversity3OutlinedIcon,
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
        label: "Target Character (optional)",
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
    icon: TuneOutlinedIcon,
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
    id: "generate_pallet",
    title: "Generate Pallet",
    description:
      "Create a simple reference color pallet, optionally based on a reference image.",
    icon: ColorLensOutlinedIcon,
    parameters: [
      {
        name: "instructions",
        label: "Instructions",
        type: "textarea",
        placeholder: "Add any extra instructions...",
        optional: true,
      },
      {
        name: "numberOfColors",
        label: "number of colors",
        type: "select",
        options: [...PALETTE_COLOR_OPTIONS],
        defaultValue: "5",
      },
    ],
    promptTemplate: (params) => {
      const numberOfColors = params.numberOfColors?.trim() || "5";
      const instructions = params.instructions?.trim();
      const basePrompt = `Create a numbered row of exactly ${numberOfColors} square color swatches on a plain white background. Fill each square with one distinct solid color. Choose colors that form a cohesive, representative palette drawn from the reference image when one is provided. If additional instructions are provided, treat them as a primary art-direction brief for the palette and let them strongly influence the color choices. Prefer distinctive, nuanced, theme-appropriate colors instead of generic default primaries unless the reference or instructions clearly call for them. Do not draw objects, scenes, gradients, shadows, textures, or extra decoration; output only the numbered swatches.`;
      if (!instructions) {
        return basePrompt;
      }
      return `${basePrompt}\n\nTheme and palette guidance to follow closely: ${instructions}`;
    },
    actionButtonLabel: "Generate Pallet",
    referenceImages: "0+",
    editImage: false,
  },
  {
    id: "remove_object",
    title: "Remove Object",
    description: "Remove unwanted objects or artifacts.",
    icon: ContentCutOutlinedIcon,
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
    description: "Replace the background with transparency.",
    icon: CropFreeOutlinedIcon,
    parameters: [],
    promptTemplate: () => `Replace the background with transparency.`,
    referenceImages: "0",
  },
].map((tool) => {
  if (!shouldExposeAspectRatio(tool)) {
    return tool;
  }

  if (tool.parameters.some((parameter) => parameter.name === "aspectRatio")) {
    return tool;
  }

  return {
    ...tool,
    parameters: [
      ...tool.parameters,
      createAspectRatioParameter(
        tool.editImage === false
          ? DEFAULT_CREATE_ASPECT_RATIO
          : AUTO_ASPECT_RATIO,
      ),
    ],
  };
});
