import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectL10nCalls } from "../collectL10nCalls";
import { STATIC_IMAGE_EDITOR_STRINGS } from "../staticStrings";
import { ALL_IMAGE_EDITOR_STRINGS } from "../allStrings";
import { TOOLS } from "../../components/tools/tools-registry";

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

  it("includes each tool's own text", () => {
    for (const tool of TOOLS) {
      expect(ALL_IMAGE_EDITOR_STRINGS[`AiImageEditor.Tool.${tool.id}.Title`]).toBe(tool.title);
      expect(ALL_IMAGE_EDITOR_STRINGS[`AiImageEditor.Tool.${tool.id}.Description`]).toBe(
        tool.description,
      );
    }
  });

  it("reuses Bloom's existing IDs for the strings Bloom already has", () => {
    expect(STATIC_IMAGE_EDITOR_STRINGS["Common.Close"]).toBe("Close");
    expect(STATIC_IMAGE_EDITOR_STRINGS["Common.Cancel"]).toBe("Cancel");
    expect(STATIC_IMAGE_EDITOR_STRINGS["EditTab.PasteButton"]).toBe("Paste");
  });
});
