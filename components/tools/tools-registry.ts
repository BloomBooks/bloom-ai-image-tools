import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";
import CropFreeOutlinedIcon from "@mui/icons-material/CropFreeOutlined";
import Diversity3OutlinedIcon from "@mui/icons-material/Diversity3Outlined";
import TextFieldsOutlinedIcon from "@mui/icons-material/TextFieldsOutlined";
import TitleOutlinedIcon from "@mui/icons-material/TitleOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
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
const SHAPE_OPTIONS = [
  "Square",
  "Portrait Rectangle",
  "Landscape Rectangle",
] as const;
const DEFAULT_SHAPE = SHAPE_OPTIONS[0];
const SHAPE_HINTS: Record<string, string> = {
  Square: "Use a square composition (equal width and height).",
  "Portrait Rectangle": "Use a tall portrait rectangle, a 9:16 aspect ratio.",
  "Landscape Rectangle": "Use a wide landscape rectangle, a 16:9 aspect ratio.",
};

const SIZE_OPTIONS = ["1k", "2k", "4k"] as const;
const DEFAULT_SIZE = SIZE_OPTIONS[0];
const SIZE_HINTS: Record<string, string> = {
  "1k": "1k image (1024px on the long edge.)",
  "2k": "2k image (2048px on the long edge.)",
  "4k": "4k image (4096px on the long edge.)",
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
        name: "shape",
        label: "Shape",
        type: "shape",
        options: [...SHAPE_OPTIONS],
        defaultValue: DEFAULT_SHAPE,
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
      const selectedShape =
        (params.shape && params.shape.trim()) || DEFAULT_SHAPE;
      const shapeHint =
        SHAPE_HINTS[selectedShape] || SHAPE_HINTS[DEFAULT_SHAPE];
      const selectedSize = (params.size && params.size.trim()) || DEFAULT_SIZE;
      const sizeHint = SIZE_HINTS[selectedSize] || SIZE_HINTS[DEFAULT_SIZE];
      const noTextReminder =
        "Do not add any frame, no lettering or typography unless the description explicitly requests text.";
      const combinedPrompt = `${basePrompt}\n\n${shapeHint} ${sizeHint} ${noTextReminder}`;
      return applyArtStyleToPrompt(combinedPrompt, params.styleId);
    },
    referenceImages: "0+",
    editImage: false,
  },
  {
    id: "enhance_drawing",
    title: "Enhance Line Drawing",
    description: "Improve old, low-res line drawings",
    icon: AutoFixHighOutlinedIcon,
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
    description: "Isolate the subject on a transparent background.",
    icon: CropFreeOutlinedIcon,
    parameters: [],
    promptTemplate: () =>
      `Replace the background with a perfectly flat chroma key green screen (#00FF66) while keeping the subject, lighting, and shadows untouched. Ensure the background is a solid, even fill with no checkerboard or transparency.`,
    referenceImages: "0",
    capabilities: { "transparent-background": true },
    postProcessingFunctions: ["green-screen-to-alpha"],
  },
];
