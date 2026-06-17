import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { BREAK_COMIC_MERGE_MARGIN_RATIO } from "../breakComic";
import { extractPieceBoundsFromRaster } from "../imageSegmentation";
import { decodePng } from "./helpers/decodePng";

// Real "Break Comic into Images" outputs: each is a cleaned sheet the AI
// produced (background/borders/text removed) that should split into 10 panels.
// These are the regression cases behind the splitter's merge-margin tuning — if
// a change makes any of them stop resolving to 10 panels, the break-up tool has
// regressed for real users. Decoding uses the dependency-free PNG decoder in
// ./helpers/decodePng.
const FIXTURES = [
  { file: "comic-coughs.png", expectedPanels: 10 },
  { file: "comic-vaccine.png", expectedPanels: 10 },
  { file: "comic-diarrhoea.png", expectedPanels: 10 },
];

const area = (b: { left: number; top: number; right: number; bottom: number }) =>
  (b.right - b.left + 1) * (b.bottom - b.top + 1);

const overlapRatio = (
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) => {
  const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return (ox * oy) / Math.min(area(a), area(b));
};

describe("break-comic sheet splitting (real AI outputs)", () => {
  for (const { file, expectedPanels } of FIXTURES) {
    it(`splits ${file} into ${expectedPanels} panels`, () => {
      const img = decodePng(join(__dirname, "fixtures", file));
      const bounds = extractPieceBoundsFromRaster(img, {
        preferComponents: true,
        componentMergeMarginRatio: BREAK_COMIC_MERGE_MARGIN_RATIO,
        targetPieceCount: expectedPanels,
      });

      // Lands on the panel count the captions expect, so per-panel caption
      // pairing fires instead of dumping all text on the sheet.
      expect(bounds).toHaveLength(expectedPanels);

      // The pieces must be genuinely separate regions, not the same panel
      // counted twice — no pair should share a meaningful area.
      for (let i = 0; i < bounds.length; i += 1) {
        for (let j = i + 1; j < bounds.length; j += 1) {
          expect(overlapRatio(bounds[i], bounds[j])).toBeLessThan(0.1);
        }
      }

      // No degenerate slivers: every panel covers a real chunk of the sheet.
      const sheetArea = img.width * img.height;
      for (const piece of bounds) {
        expect(area(piece) / sheetArea).toBeGreaterThan(0.005);
      }
    });
  }
});
