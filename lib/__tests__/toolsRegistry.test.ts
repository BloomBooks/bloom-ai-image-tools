import { describe, expect, it } from "vitest";
import { TOOLS } from "../../components/tools/tools-registry";

describe("ethnicity tool prompt", () => {
  it("targets all characters when no specific character is provided", () => {
    const ethnicityTool = TOOLS.find((tool) => tool.id === "ethnicity");

    expect(ethnicityTool).toBeDefined();

    const prompt = ethnicityTool?.promptTemplate?.({
      ethnicity: "Melanesian",
      character: "",
    });

    expect(prompt).toContain("Change the ethnicity of all characters in the image");
    expect(prompt).not.toContain("the main character");
  });

  it("keeps the localize tools grouped together", () => {
    const localizeToolIds = TOOLS.filter((tool) => tool.group === "localize")
      .sort((left, right) => left.title.localeCompare(right.title))
      .map((tool) => tool.id);

    expect(localizeToolIds).toEqual([
      "extract_cast_of_characters",
      "ethnicity",
      "apply_localized_characters",
    ]);
  });

  it("keeps the enhance tools grouped together", () => {
    const enhanceToolIds = TOOLS.filter((tool) => tool.group === "enhance")
      .sort((left, right) => left.title.localeCompare(right.title))
      .map((tool) => tool.id);

    expect(enhanceToolIds).toEqual(["custom", "enhance_drawing", "improve_drawing"]);
  });

  it("keeps extract cast further instructions subordinate to the reference images", () => {
    const extractCastTool = TOOLS.find((tool) => tool.id === "extract_cast_of_characters");

    expect(extractCastTool).toBeDefined();

    const prompt = extractCastTool?.promptTemplate?.({
      splitIntoSeparateFiles: "false",
      furtherInstructions: "There are 3 characters: Brother, Sister, and Mother.",
    });

    expect(prompt).toContain("The supplied reference images are the primary source of truth");
    expect(prompt).toContain(
      "Use these extra notes only to identify which characters to include or skip",
    );
    expect(prompt).toContain("Do not let these notes override the visual evidence");
    expect(prompt).not.toContain("Additional instructions to follow closely");
  });

  it("keeps apply localized characters on auto shape with no target character field", () => {
    const localizedCharactersTool = TOOLS.find((tool) => tool.id === "apply_localized_characters");

    expect(localizedCharactersTool).toBeDefined();
    expect(localizedCharactersTool?.parameters.some((param) => param.name === "character")).toBe(
      false,
    );
    expect(localizedCharactersTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(
      false,
    );

    const prompt = localizedCharactersTool?.promptTemplate?.({
      furtherInstructions: "Keep the children's-book line quality.",
    });

    expect(prompt).toContain("update the characters in this image");
    expect(prompt).not.toContain("all matching characters in the scene");
  });

  it("hides shape when tools should preserve the input or use a fixed ratio", () => {
    const changeStyleTool = TOOLS.find((tool) => tool.id === "change_style");
    const removeObjectTool = TOOLS.find((tool) => tool.id === "remove_object");
    const paletteTool = TOOLS.find((tool) => tool.id === "generate_pallet");

    expect(changeStyleTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(false);
    expect(removeObjectTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(false);
    expect(paletteTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(false);
    expect(paletteTool?.hiddenAspectRatioDefault).toBe("21:9");
  });
});
