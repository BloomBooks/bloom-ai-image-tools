import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectL10nCalls } from "../collectL10nCalls";
import { STATIC_IMAGE_EDITOR_STRINGS } from "../staticStrings";
import { ALL_IMAGE_EDITOR_STRINGS } from "../allStrings";
import { TOOLS } from "../../components/tools/tools-registry";
import { NOT_TRANSLATED } from "../untranslated";

const repoRoot = join(__dirname, "..", "..");

const sourceFiles = (dir: string): string[] => {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === "__tests__" ||
      entry === "collectL10nCalls.ts" ||
      entry.startsWith(".")
    ) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
};

const callSiteStrings = (): Map<string, string> => {
  const strings = new Map<string, string>();
  for (const dir of ["components", "lib"]) {
    for (const file of sourceFiles(join(repoRoot, dir))) {
      for (const [id, english] of collectL10nCalls(readFileSync(file, "utf8"))) {
        strings.set(id, english);
      }
    }
  }
  return strings;
};

describe("the editor's string table", () => {
  it("holds every string the l10n() calls ask for", () => {
    const missing: string[] = [];
    const different: string[] = [];
    for (const [id, english] of callSiteStrings()) {
      if (!(id in STATIC_IMAGE_EDITOR_STRINGS)) {
        missing.push(id);
      } else if (STATIC_IMAGE_EDITOR_STRINGS[id] !== english) {
        different.push(id);
      }
    }
    // Run `node dev/generateStaticStrings.mjs` to bring lib/staticStrings.ts back in step.
    expect({ missing, different }).toEqual({ missing: [], different: [] });
  });

  it("has no entry no call site asks for", () => {
    const asked = callSiteStrings();
    expect(Object.keys(STATIC_IMAGE_EDITOR_STRINGS).filter((id) => !asked.has(id))).toEqual([]);
  });

  it("includes each tool's own text, except what Bloom decided not to translate", () => {
    for (const tool of TOOLS) {
      const titleId = `AiImageEditor.Tool.${tool.id}.Title`;
      if (!NOT_TRANSLATED.has(titleId)) {
        expect(ALL_IMAGE_EDITOR_STRINGS[titleId]).toBe(tool.title);
      }
      const descriptionId = `AiImageEditor.Tool.${tool.id}.Description`;
      if (tool.description?.trim() && !NOT_TRANSLATED.has(descriptionId)) {
        expect(ALL_IMAGE_EDITOR_STRINGS[descriptionId]).toBe(tool.description);
      }
    }
  });

  it("leaves the strings Bloom decided not to translate out of the table", () => {
    const asked = [...NOT_TRANSLATED].filter((id) => id in ALL_IMAGE_EDITOR_STRINGS);
    expect(asked).toEqual([]);
  });

  it("gives one string one ID", () => {
    // Two IDs carrying the same English would be sent to a translator twice and could
    // then drift apart. Share an ID instead: see SHARED_IDS in components/tools/toolStrings.ts.
    const idsByEnglish = new Map<string, string[]>();
    for (const [id, english] of Object.entries(ALL_IMAGE_EDITOR_STRINGS)) {
      const key = english.trim().toLowerCase();
      idsByEnglish.set(key, [...(idsByEnglish.get(key) ?? []), id]);
    }
    const duplicated = [...idsByEnglish.entries()].filter(([, ids]) => ids.length > 1);
    expect(duplicated).toEqual([]);
  });

  it("asks for nothing empty, and nothing that is only digits or symbols", () => {
    // Punctuation is worth a translator's time only where the punctuation itself is
    // what differs between languages: the separator between the items of a list is
    // "، " in Arabic and "、" in Chinese.
    const punctuationThatDiffers = new Set(["AiImageEditor.Strip.ListSeparator"]);
    const notWorthTranslating = Object.entries(ALL_IMAGE_EDITOR_STRINGS).filter(
      ([id, english]) =>
        !punctuationThatDiffers.has(id) && (!english.trim() || !/\p{Letter}/u.test(english)),
    );
    expect(notWorthTranslating).toEqual([]);
  });

  it("keeps a tool's step number out of its translated title", () => {
    const numbered = TOOLS.filter((tool) => /^\s*\d/.test(tool.title)).map((tool) => tool.id);
    expect(numbered).toEqual([]);
  });

  it("reuses Bloom's existing IDs for the strings Bloom already has", () => {
    expect(STATIC_IMAGE_EDITOR_STRINGS["Common.Close"]).toBe("Close");
    expect(STATIC_IMAGE_EDITOR_STRINGS["Common.Cancel"]).toBe("Cancel");
    expect(STATIC_IMAGE_EDITOR_STRINGS["EditTab.PasteButton"]).toBe("Paste");
  });
});
