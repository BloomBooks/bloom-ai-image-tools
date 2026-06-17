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
    const coloringBookTool = TOOLS.find((tool) => tool.id === "coloring_book");

    expect(changeStyleTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(false);
    expect(removeObjectTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(false);
    expect(paletteTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(false);
    expect(coloringBookTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(true);
    expect(paletteTool?.hiddenAspectRatioDefault).toBe("21:9");
  });

  it("adds a break-comic tool that splits into pieces and keeps the grid sheet", () => {
    const breakComicTool = TOOLS.find((tool) => tool.id === "break_comic_into_images");

    expect(breakComicTool).toBeDefined();
    expect(breakComicTool?.group).toBe("more");
    expect(breakComicTool?.derivedResultMode).toBe("split-images");
    expect(breakComicTool?.keepDerivedSourceSheet).toBe(true);
    expect(breakComicTool?.captionsFromTextChannel).toBe(true);
    expect(breakComicTool?.editImage).toBe(true);
    expect(breakComicTool?.referenceImages).toBe("0");
    expect(breakComicTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(false);

    // No method selector — the tool always uses the cleanup-edit extraction.
    expect(breakComicTool?.parameters.some((param) => param.name === "method")).toBe(false);

    // The prompt is edit-framed and demands one image.
    const defaultPrompt = breakComicTool?.promptTemplate?.({
      furtherInstructions: "Skip the title banner.",
    });
    expect(defaultPrompt).toContain("Edit this image");
    expect(defaultPrompt).toContain("exactly ONE output image");
    expect(defaultPrompt).toContain(
      "Additional instructions for the illustrations: Skip the title banner.",
    );
  });

  it("moves coloring-book restyling into its own more tool with difficulty support", () => {
    const changeStyleTool = TOOLS.find((tool) => tool.id === "change_style");
    const coloringBookTool = TOOLS.find((tool) => tool.id === "coloring_book");

    expect(coloringBookTool).toBeDefined();
    expect(coloringBookTool?.group).toBe("more");
    expect(
      coloringBookTool?.parameters.find((param) => param.name === "difficulty")?.options,
    ).toEqual(["Simple", "Moderate", "Complex"]);
    expect(coloringBookTool?.parameters.find((param) => param.name === "size")?.type).toBe("size");

    const prompt = coloringBookTool?.promptTemplate?.({ difficulty: "Complex" });

    expect(prompt).toContain("children's coloring book page");
    expect(prompt).toContain("Difficulty: Complex.");
    expect(prompt).toContain("closed shapes for coloring");
    expect(prompt).toContain("Do not use large solid black filled areas");
    expect(prompt).toContain("Keep interior regions open and white for coloring");
    expect(
      changeStyleTool?.parameters.find((param) => param.name === "styleId")?.excludeArtStyleIds,
    ).toContain("coloring-book-page");
  });
});
