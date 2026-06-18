import { describe, expect, it } from "vite-plus/test";
import { TOOLS } from "../../components/tools/tools-registry";
import { getRequestedAspectRatioValue, getRequestedImageSizeValue } from "../toolHelpers";

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
