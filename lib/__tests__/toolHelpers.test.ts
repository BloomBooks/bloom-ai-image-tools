import { describe, expect, it } from "vite-plus/test";
import { TOOLS } from "../../components/tools/tools-registry";
import { LOCAL_DUMMY_MODEL_ID } from "../localModels";
import {
  getRequestedAspectRatioValue,
  getRequestedImageSizeValue,
  toolRunCallsOpenRouter,
} from "../toolHelpers";

describe("tool aspect ratio defaults", () => {
  it("inherits the target image shape for edit tools without a shape picker", () => {
    const localizedCharactersTool = TOOLS.find((tool) => tool.id === "apply_localized_characters");

    expect(getRequestedAspectRatioValue(localizedCharactersTool ?? null, {})).toBe("auto");
  });

  it("defaults scratch generation tools without a shape picker to square", () => {
    const extractCastTool = TOOLS.find((tool) => tool.id === "extract_cast_of_characters");

    expect(getRequestedAspectRatioValue(extractCastTool ?? null, {})).toBe("1:1");
  });

  it("allows hidden tools to override their default shape", () => {
    const paletteTool = TOOLS.find((tool) => tool.id === "generate_pallet");

    expect(getRequestedAspectRatioValue(paletteTool ?? null, {})).toBe("21:9");
  });

  it("keeps an explicit shape selection when the tool exposes one", () => {
    const generateImageTool = TOOLS.find((tool) => tool.id === "generate_image");

    expect(getRequestedAspectRatioValue(generateImageTool ?? null, { aspectRatio: "16:9" })).toBe(
      "16:9",
    );
  });

  it("derives a 2k size bucket for edit tools when the target is larger than 1k", () => {
    const localizedCharactersTool = TOOLS.find((tool) => tool.id === "apply_localized_characters");

    expect(
      getRequestedImageSizeValue(
        localizedCharactersTool ?? null,
        {},
        { width: 1500, height: 1237 },
      ),
    ).toBe("2k");
  });

  it("keeps an explicit size selection when one is provided", () => {
    const localizedCharactersTool = TOOLS.find((tool) => tool.id === "apply_localized_characters");

    expect(
      getRequestedImageSizeValue(
        localizedCharactersTool ?? null,
        { size: "4k" },
        { width: 1500, height: 1237 },
      ),
    ).toBe("4k");
  });

  it("does not force a size for generation-only tools", () => {
    const extractCastTool = TOOLS.find((tool) => tool.id === "extract_cast_of_characters");

    expect(
      getRequestedImageSizeValue(extractCastTool ?? null, {}, { width: 1500, height: 1237 }),
    ).toBeUndefined();
  });
});

describe("which runs would spend money", () => {
  const getTool = (id: string) => TOOLS.find((tool) => tool.id === id) ?? null;

  it("counts a normal tool on a catalog model", () => {
    expect(
      toolRunCallsOpenRouter(
        getTool("apply_localized_characters"),
        "google/gemini-3.1-flash-image",
      ),
    ).toBe(true);
  });

  it("does not count the browser-only tools or the local dummy model", () => {
    expect(
      toolRunCallsOpenRouter(getTool("remove_background"), "google/gemini-3.1-flash-image"),
    ).toBe(false);
    expect(toolRunCallsOpenRouter(getTool("pdf_to_images"), "google/gemini-3.1-flash-image")).toBe(
      false,
    );
    expect(
      toolRunCallsOpenRouter(getTool("apply_localized_characters"), LOCAL_DUMMY_MODEL_ID),
    ).toBe(false);
  });
});
