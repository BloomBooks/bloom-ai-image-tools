import { describe, expect, it } from "vite-plus/test";
import { TOOLS } from "../../components/tools/tools-registry";
import { getRequestedAspectRatioValue } from "../toolHelpers";

describe("tool aspect ratio defaults", () => {
  it("inherits the target image shape for edit tools without a shape picker", () => {
    const localizedCharactersTool = TOOLS.find(
      (tool) => tool.id === "apply_localized_characters",
    );

    expect(getRequestedAspectRatioValue(localizedCharactersTool ?? null, {})).toBe("auto");
  });

  it("defaults scratch generation tools without a shape picker to square", () => {
    const extractCastTool = TOOLS.find((tool) => tool.id === "extract_cast_of_characters");

    expect(getRequestedAspectRatioValue(extractCastTool ?? null, {})).toBe("1:1");
  });

  it("keeps an explicit shape selection when the tool exposes one", () => {
    const generateImageTool = TOOLS.find((tool) => tool.id === "generate_image");

    expect(
      getRequestedAspectRatioValue(generateImageTool ?? null, { aspectRatio: "16:9" }),
    ).toBe("16:9");
  });
});