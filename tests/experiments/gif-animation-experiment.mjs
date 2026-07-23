// Experiment: drive the Make-GIF pipeline end to end WITHOUT the browser app,
// so the sprite-sheet prompt and the grid slicing can be iterated on quickly
// against the real generator. Produces the raw sheet, the sliced frames, a
// contact sheet, the assembled GIF, and numeric jitter metrics per run.
//
// Run:
//   node tests/experiments/gif-animation-experiment.mjs
// Env:
//   OPENROUTER_KEY   (required) OpenRouter API key
//   INPUT_IMAGE      (required) reference image path
//   ANIMATION_DESC   animation description (same text a user would type)
//   OUT_DIR          output directory (default: tests/experiments/gif-out)
//   RUN_NAME         subdirectory label for this run (default: timestamp)
//   MODEL            default: google/gemini-3.1-flash-image (the app default)
//   FRAME_COUNT      default: 8
//   PROMPT_FILE      optional: read the full prompt from a file instead of
//                    building it from lib/gifAnimationPrompt.ts (for trying
//                    prompt variants without touching the library)
//   ASPECT_RATIO     default: 16:9   IMAGE_SIZE default: 2K
//
// The slicing runs the REAL lib/imageSegmentation.ts (bundled on the fly with
// esbuild); PNG<->raw-RGBA conversion and GIF assembly go through the Python
// helper gif_experiment_helper.py (PIL), which also reports per-frame subject
// centroid/baseline drift — the numbers behind "the character jumps around".

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

// RESLICE=1 skips the generation call and re-slices OUT_DIR/RUN_NAME/sheet.png
// from a previous run (free iteration on the slicing code).
// SHEET=path re-slices a specific sheet image (implies RESLICE); real-world
// failure sheets live in tests/fixtures/gif-sheets — run each of them after
// slicer changes:
//   for f in tests/fixtures/gif-sheets/*; do SHEET=$f node tests/experiments/gif-animation-experiment.mjs; done
const SHEET = process.env.SHEET && path.resolve(process.env.SHEET);
const RESLICE = process.env.RESLICE === "1" || Boolean(SHEET);
const KEY = process.env.OPENROUTER_KEY;
const INPUT = process.env.INPUT_IMAGE && path.resolve(process.env.INPUT_IMAGE);
const DESC = process.env.ANIMATION_DESC || "";
const MODEL = process.env.MODEL || "google/gemini-3.1-flash-image";
const FRAME_COUNT = Number(process.env.FRAME_COUNT || 12);
const OUT_ROOT = path.resolve(process.env.OUT_DIR || path.join(here, "gif-out"));
const RUN_NAME =
  process.env.RUN_NAME ||
  (SHEET
    ? path.basename(SHEET).replace(/\.[^.]+$/, "")
    : new Date().toISOString().replace(/[:.]/g, "-"));
const OUT = path.join(OUT_ROOT, RUN_NAME);
const ASPECT_RATIO = process.env.ASPECT_RATIO || "16:9";
const IMAGE_SIZE = process.env.IMAGE_SIZE || "2K";

if (!RESLICE && (!KEY || !INPUT)) {
  console.error("Need OPENROUTER_KEY and INPUT_IMAGE.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const py = (args, input) =>
  execFileSync("py", [path.join(here, "gif_experiment_helper.py"), ...args], {
    input,
    maxBuffer: 1024 * 1024 * 512,
  });

// ---------- 1. Build the prompt (the real one, unless overridden) ----------
const bundleDir = path.join(OUT_ROOT, "_bundle");
mkdirSync(bundleDir, { recursive: true });
// esbuild is not a direct dependency; borrow the copy that ships with tsup.
const require = createRequire(import.meta.url);
const tsupDir = path.dirname(require.resolve("tsup/package.json", { paths: [repoRoot] }));
const esbuildBin = require.resolve("esbuild/bin/esbuild", { paths: [tsupDir] });
const bundle = (entry, outfile) => {
  execFileSync(process.execPath, [
    esbuildBin,
    entry,
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${outfile}`,
  ]);
  return import(pathToFileURL(outfile));
};

const promptModulePath = path.join(bundleDir, "gifAnimationPrompt.mjs");
const { buildGifAnimationSheetPrompt } = await bundle(
  path.join(repoRoot, "lib", "gifAnimationPrompt.ts"),
  promptModulePath,
);

// ENDING: "loop" (default) or "one-way". MAGENTA=0 opts out of the magenta
// frame boxes (the app default) back to the invisible-grid prompt.
const MAGENTA = process.env.MAGENTA !== "0";
let prompt = process.env.PROMPT_FILE
  ? readFileSync(path.resolve(process.env.PROMPT_FILE), "utf8").trim()
  : buildGifAnimationSheetPrompt(FRAME_COUNT, process.env.ENDING || "loop", {
      magentaBoxes: MAGENTA,
    });
if (DESC) {
  prompt += `\n\nAnimate this specific action: ${DESC}`;
}
const sheetPath = path.join(OUT, "sheet.png");
if (SHEET) {
  writeFileSync(sheetPath, readFileSync(SHEET));
} else if (!RESLICE) {
  writeFileSync(path.join(OUT, "prompt.txt"), prompt);
  await generateSheet();
}

// ---------- 2. Generate the sprite sheet ----------
async function generateSheet() {
  const inputBytes = readFileSync(INPUT);
  const inputMime = INPUT.toLowerCase().endsWith(".gif") ? "image/gif" : "image/png";
  const body = {
    model: MODEL,
    modalities: ["image", "text"],
    stream: false,
    max_tokens: Number(process.env.MAX_TOKENS || 64000),
    image_config: { aspect_ratio: ASPECT_RATIO, image_size: IMAGE_SIZE },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:${inputMime};base64,${inputBytes.toString("base64")}` },
          },
        ],
      },
    ],
  };

  console.log(`[${RUN_NAME}] calling ${MODEL} (${FRAME_COUNT} frames, ${ASPECT_RATIO})...`);
  const started = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Bloom GIF animation experiment",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, JSON.stringify(data?.error ?? data).slice(0, 800));
    process.exit(1);
  }
  const msg = data?.choices?.[0]?.message ?? {};
  console.log(
    `[${RUN_NAME}] ${Date.now() - started}ms, cost $${data?.usage?.cost ?? "?"}, images: ${
      Array.isArray(msg.images) ? msg.images.length : 0
    }`,
  );
  const imageUrl = Array.isArray(msg.images) ? msg.images[0]?.image_url?.url : null;
  if (!imageUrl?.startsWith("data:image")) {
    console.error("No image returned. Text channel:", String(msg.content).slice(0, 500));
    process.exit(1);
  }
  writeFileSync(sheetPath, Buffer.from(imageUrl.split(",")[1], "base64"));
  console.log(`[${RUN_NAME}] sheet -> ${sheetPath}`);
}

// ---------- 3. Slice with the real grid-cell logic ----------
const segModulePath = path.join(bundleDir, "imageSegmentation.mjs");
const {
  computeGridCellBoundsFromRaster,
  computeUniformGridCellBoundsFromRaster,
  computeGridFrameLayout,
  detectMagentaFrameBounds,
  dropSparseGridCells,
} = await bundle(path.join(repoRoot, "lib", "imageSegmentation.ts"), segModulePath);

const meta = JSON.parse(py(["png2bin", sheetPath, path.join(OUT, "sheet.bin")]).toString());
const raster = {
  data: new Uint8ClampedArray(readFileSync(path.join(OUT, "sheet.bin"))),
  width: meta.width,
  height: meta.height,
};
// Magenta boxes (when requested and found) beat everything; then the same
// preference order as sliceSheetIntoGridCells: layout-driven uniform cut,
// content-inferred grid as fallback.
const BOX_LINE_INSET = 8; // past the magenta line + its halo, into the box interior
const magentaBounds = MAGENTA
  ? detectMagentaFrameBounds(raster).map((b) => ({
      left: b.left + BOX_LINE_INSET,
      top: b.top + BOX_LINE_INSET,
      right: b.right - BOX_LINE_INSET,
      bottom: b.bottom - BOX_LINE_INSET,
    }))
  : [];
const uniformBounds = magentaBounds.length
  ? []
  : computeUniformGridCellBoundsFromRaster(raster, FRAME_COUNT);
const cellBounds = magentaBounds.length
  ? magentaBounds
  : uniformBounds.length
    ? uniformBounds
    : computeGridCellBoundsFromRaster(raster);
console.log(
  `[${RUN_NAME}] grid cells: ${cellBounds.length} (${
    magentaBounds.length
      ? "magenta boxes"
      : uniformBounds.length
        ? "uniform layout cut"
        : "content-inferred fallback"
  })`,
);

// The REAL frame layout (failed-frame dropping + edge inset + row-baseline
// registration), shared with the app.
const keptBounds = dropSparseGridCells(raster, cellBounds);
if (keptBounds.length !== cellBounds.length) {
  console.log(`[${RUN_NAME}] dropped ${cellBounds.length - keptBounds.length} failed frame(s)`);
}
const layout = computeGridFrameLayout(raster, keptBounds);
const cells = layout.windows.map((w) => ({
  left: w.left,
  top: w.top,
  right: w.right,
  bottom: w.bottom,
  dx: w.destX,
  dy: w.destY,
}));
const cellsPath = path.join(OUT, "cells.json");
writeFileSync(
  cellsPath,
  JSON.stringify(
    { frameWidth: layout.frameWidth, frameHeight: layout.frameHeight, cells },
    null,
    2,
  ),
);

// ---------- 4. Assemble frames + GIF + metrics ----------
const report = JSON.parse(py(["assemble", sheetPath, cellsPath, OUT]).toString());
writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(report, null, 2));
console.log(`[${RUN_NAME}] metrics:`, JSON.stringify(report.summary));
console.log(`[${RUN_NAME}] done -> ${OUT}`);
