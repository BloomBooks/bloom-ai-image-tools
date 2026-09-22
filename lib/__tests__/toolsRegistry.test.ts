import { describe, expect, it } from "vitest";
import { ALL_TOOLS, resolveStoredToolId, TOOLS } from "../../components/tools/tools-registry";
import { toolSupportsBatch } from "../toolHelpers";

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

  it("keeps the localize tools grouped together, in the order they are run", () => {
    // The order is the stepNumber the card draws in front of the title; it used to be a
    // "1) " prefix on the title itself, which a translator would have had to carry.
    const localizeToolIds = TOOLS.filter((tool) => tool.group === "localize")
      .sort((left, right) => (left.stepNumber ?? 0) - (right.stepNumber ?? 0))
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

    expect(enhanceToolIds).toEqual(["custom", "improve_quality"]);
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

    expect(prompt).toContain("Update the characters in the scene");
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
    expect(coloringBookTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(false);
    expect(paletteTool?.hiddenAspectRatioDefault).toBe("21:9");
  });

  it("adds a break-comic tool that splits into pieces and keeps the grid sheet", () => {
    const breakComicTool = ALL_TOOLS.find((tool) => tool.id === "break_comic_into_images");

    // Switched off for now, so it is defined but not offered.
    expect(breakComicTool?.disabled).toBe(true);
    expect(TOOLS.some((tool) => tool.id === "break_comic_into_images")).toBe(false);

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
    // Sized the way Improve Quality is: the slot decides, and the menu only
    // appears outside Bloom.
    expect(
      coloringBookTool?.parameters.find((param) => param.name === "targetResolution")?.type,
    ).toBe("target-resolution");
    expect(coloringBookTool?.modelIds).toEqual(["openai/gpt-image-2.5-sunburst"]);

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

  it("asks Improve Quality for a faithful reproduction, with no shape picker", () => {
    const improveQualityTool = TOOLS.find((tool) => tool.id === "improve_quality");

    expect(improveQualityTool).toBeDefined();
    expect(improveQualityTool?.group).toBe("enhance");
    // GPT Image 2.5 only: it letterboxes as told, Gemini paints the scene out.
    expect(improveQualityTool?.modelIds).toEqual(["openai/gpt-image-2.5-sunburst"]);
    expect(improveQualityTool?.editImage).not.toBe(false);
    expect(improveQualityTool?.referenceImages).toBe("0");
    // Scaling up keeps the picture's own shape, so there is no Shape menu.
    expect(improveQualityTool?.parameters.some((param) => param.name === "aspectRatio")).toBe(
      false,
    );
    expect(
      improveQualityTool?.parameters.find((param) => param.name === "targetResolution")?.type,
    ).toBe("target-resolution");
    expect(
      improveQualityTool?.parameters.find((param) => param.name === "targetResolution")
        ?.defaultValue,
    ).toBe("container");
    // The picture's kind and the resolution selector are the tool's parameters.
    expect(improveQualityTool?.parameters.map((param) => param.name)).toEqual([
      "imageKind",
      "targetResolution",
    ]);

    const basePrompt = improveQualityTool?.promptTemplate?.({
      targetResolution: "hd",
      resolvedImageKind: "other",
    });
    expect(basePrompt).toContain("Reproduce this exact image at a higher resolution");
    expect(basePrompt).toContain("Do not change the composition");
    expect(basePrompt).not.toContain("approximately");

    // A drawing gets the restoration wording instead.
    const lineArtPrompt = improveQualityTool?.promptTemplate?.({
      targetResolution: "hd",
      resolvedImageKind: "line-art",
    });
    expect(lineArtPrompt).toContain("Restore this drawing to the condition it was in");
    expect(lineArtPrompt).not.toContain("Reproduce this exact image at a higher resolution");

    const sizedPrompt = improveQualityTool?.promptTemplate?.({
      targetResolution: "hd",
      resolvedImageKind: "other",
      resolvedTargetPixels: "1620 x 1080",
    });
    expect(sizedPrompt).toContain(
      "The output should be approximately 1620 x 1080 pixels (same shape as the input).",
    );

    const letterboxedPrompt = improveQualityTool?.promptTemplate?.({
      targetResolution: "container",
      resolvedImageKind: "other",
      resolvedTargetPixels: "3840 x 1280",
      letterboxInstruction: "The output canvas is 3840 x 1280 pixels, padded.",
    });
    expect(letterboxedPrompt).toContain("The output canvas is 3840 x 1280 pixels, padded.");
    expect(letterboxedPrompt).not.toContain("approximately");
  });

  it("flags allowBatch on exactly the single-image-in/single-image-out edit tools", () => {
    const batchEligibleToolIds = TOOLS.filter((tool) => toolSupportsBatch(tool))
      .map((tool) => tool.id)
      .sort();

    expect(batchEligibleToolIds).toEqual(
      [
        "apply_localized_characters",
        "change_style",
        "change_text",
        "coloring_book",
        "custom",
        "ethnicity",
        "improve_quality",
        "remove_background",
        "remove_object",
        "stylized_title",
      ].sort(),
    );
  });

  it("never flags allowBatch on tools with a derived multi-output result", () => {
    const derivedResultTools = TOOLS.filter((tool) => tool.derivedResultMode);

    expect(derivedResultTools.length).toBeGreaterThan(0);
    for (const tool of derivedResultTools) {
      expect(toolSupportsBatch(tool)).toBe(false);
    }
  });

  it("excludes generation-only, PDF, and cast-extraction tools from batch", () => {
    const explicitlyExcludedIds = [
      "generate_image",
      "break_into_pieces",
      "extract_cast_of_characters",
      "make_gif",
      "break_comic_into_images",
      "pdf_to_images",
      "generate_pallet",
    ];

    for (const toolId of explicitlyExcludedIds) {
      const tool = ALL_TOOLS.find((candidate) => candidate.id === toolId);
      expect(tool).toBeDefined();
      expect(toolSupportsBatch(tool)).toBe(false);
    }
  });
});

describe("change style tool prompt", () => {
  const changeStyle = () => TOOLS.find((tool) => tool.id === "change_style");

  it("guards the result against being painted when the style is line art", () => {
    const prompt = changeStyle()?.promptTemplate?.({ styleId: "line-drawing-sketch" });

    expect(prompt).toContain("stays a line drawing");
    expect(prompt).toContain("Line Drawing and Sketch Style");
  });

  it("leaves the line-art guard off a painterly style", () => {
    const prompt = changeStyle()?.promptTemplate?.({ styleId: "watercolor-dream" });

    expect(prompt).not.toContain("stays a line drawing");
  });

  it("appends extra instructions only when they are given", () => {
    const withExtras = changeStyle()?.promptTemplate?.({
      styleId: "watercolor-dream",
      extraInstructions: "Keep the hat blue",
    });
    const withoutExtras = changeStyle()?.promptTemplate?.({
      styleId: "watercolor-dream",
      extraInstructions: "   ",
    });

    expect(withExtras).toContain("Extra instructions: Keep the hat blue");
    expect(withoutExtras).not.toContain("Extra instructions:");
  });
});

describe("no-unrequested-text instruction", () => {
  // GPT Image 2.5 writes captions and labels into images that never asked for
  // them, so every tool prompt has to say not to.
  // Generate Pallet asks for numbered swatches, and the numbers are text.
  const TEXT_TOOL_IDS = ["change_text", "stylized_title", "generate_pallet"];

  it("ends every image prompt with it", () => {
    const toolsWithPrompts = TOOLS.filter(
      (tool) => !TEXT_TOOL_IDS.includes(tool.id) && tool.promptTemplate({})?.trim(),
    );
    expect(toolsWithPrompts.length).toBeGreaterThan(5);

    for (const tool of toolsWithPrompts) {
      expect(tool.promptTemplate({}), tool.id).toContain(
        "Do not add any text, lettering, captions",
      );
    }
  });

  it("leaves out the tools whose job is text", () => {
    for (const toolId of TEXT_TOOL_IDS) {
      const tool = TOOLS.find((candidate) => candidate.id === toolId);
      expect(tool?.addsTextToImage).toBe(true);
      expect(tool?.promptTemplate({})).not.toContain("Do not add any text");
    }
  });

  it("adds nothing to a tool that makes no model call", () => {
    const pdf = ALL_TOOLS.find((tool) => tool.id === "pdf_to_images");
    expect(pdf?.promptTemplate({})).toBe("");
  });
});

describe("preserve-what-you-are-not-changing instruction", () => {
  // OpenAI's image prompting guide: separate the change from the constraints,
  // and name what must not move.
  it("closes a surgical edit tool's prompt with its own preserve list", () => {
    const removeObject = TOOLS.find((tool) => tool.id === "remove_object");
    const prompt = removeObject?.promptTemplate({ target: "the red ball" }) ?? "";

    expect(prompt).toContain("Change only what is asked for above");
    expect(prompt).toContain("every other object and character");
  });

  it("gives each tool a list of its own rather than one shared sentence", () => {
    const changeText = TOOLS.find((tool) => tool.id === "change_text");
    const ethnicity = TOOLS.find((tool) => tool.id === "ethnicity");

    expect(changeText?.preserveInEdit).toContain("the font");
    expect(ethnicity?.preserveInEdit).toContain("the pose");
    expect(changeText?.preserveInEdit).not.toBe(ethnicity?.preserveInEdit);
  });

  it("says nothing about preserving for a tool that rebuilds the whole picture", () => {
    // Change Style and Coloring Book exist to change the rendering everywhere,
    // so a "keep the art style" line would contradict the job.
    for (const toolId of ["change_style", "coloring_book", "make_gif", "generate_image"]) {
      const tool = TOOLS.find((candidate) => candidate.id === toolId);
      expect(tool?.preserveInEdit, toolId).toBeUndefined();
      expect(tool?.promptTemplate({}), toolId).not.toContain("Change only what is asked for");
    }
  });
});

describe("resolveStoredToolId", () => {
  it("keeps an id the app still offers", () => {
    expect(resolveStoredToolId("change_style")).toBe("change_style");
  });

  it("drops an id for a tool that is gone or switched off", () => {
    // Saved state outlives the tool list; a restored id that matches nothing
    // would leave the workspace with a tool selected and no panel for it.
    for (const stale of ["upscale", "enhance_drawing", "improve_drawing", "", null, undefined]) {
      expect(resolveStoredToolId(stale), String(stale)).toBeNull();
    }
    const disabled = ALL_TOOLS.find((tool) => tool.disabled);
    expect(disabled).toBeDefined();
    expect(resolveStoredToolId(disabled!.id)).toBeNull();
  });
});
