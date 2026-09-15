// Experiment: how much does a reference image's pixel size change what
// OpenRouter charges for one image generation? The findings, and the numbers
// this produced on 2026-09-14, are written up in MODEL-COSTS.md.
//
// Replicates exactly what services/openRouterService.ts sends on the images
// endpoint: prompt + n:1 + aspect_ratio + size + input_references[].
//
// Each run spends real money — a few cents per ladder entry.
//
// First build the reference ladder it reads (ImageMagick), from any picture:
//
//   mkdir -p tests/experiments/refs
//   for E in 256 512 768 1024 1536 2048 4096; do \
//     magick sample.png -resize "${E}x${E}>" -resize "${E}x${E}<" \
//       tests/experiments/refs/ref-$E.png; done
//   for E in 512 1024 1536 2048; do \
//     magick sample.png -resize "${E}x${E}^" -gravity center -extent "${E}x${E}" \
//       tests/experiments/refs/ref-sq$E.png; done
//
// Then:
//
//   node tests/experiments/reference-cost-experiment.mjs
//
// Requires BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS in the environment.
// Tunable with EXPERIMENT_MODEL, OUTPUT_SIZE, and LADDER (see below).

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS;
if (!KEY) {
  console.error("Missing BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS");
  process.exit(1);
}

const MODEL = process.env.EXPERIMENT_MODEL || "openai/gpt-image-2.5-sunburst";

// The Generate Pallet tool's real prompt, 5 colors, no extra instructions.
const PROMPT =
  "Create a numbered row of exactly 5 square color swatches on a plain white background. " +
  "Fill each square with one distinct solid color. Choose colors that form a cohesive, " +
  "representative palette drawn from the reference image when one is provided. If additional " +
  "instructions are provided, treat them as a primary art-direction brief for the palette and " +
  "let them strongly influence the color choices. Prefer distinctive, nuanced, theme-appropriate " +
  "colors instead of generic default primaries unless the reference or instructions clearly call " +
  "for them. Do not draw objects, scenes, gradients, shadows, textures, or extra decoration; " +
  "output only the numbered swatches.";

// What the palette tool actually asks for: tier 1K at 21:9, snapped by
// snapToOpenAiImageSize to the model's 655360-pixel floor.
const OUTPUT_SIZE = process.env.OUTPUT_SIZE || "1232x544";

// Long edges to probe, plus a run with no reference at all.
const LADDER = (process.env.LADDER || "none,256,512,768,1024,1536,2048,4096").split(",");

// A ladder entry is "none", a reference name ("1024", "sq1024"), or
// "N*<name>" for N copies of that reference in one request.
const loadRef = async (edge) => {
  if (edge === "none") return null;
  const star = edge.indexOf("*");
  const count = star > 0 ? Number(edge.slice(0, star)) : 1;
  const name = star > 0 ? edge.slice(star + 1) : edge;
  const file = path.resolve(here, "refs", `ref-${name}.png`);
  const bytes = await readFile(file);
  return {
    dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    bytes: bytes.length * count,
    count,
  };
};

const runOne = async (edge) => {
  const ref = await loadRef(edge);
  const body = {
    model: MODEL,
    prompt: PROMPT,
    n: 1,
    // A concrete `size` requires aspect_ratio "auto" or OpenRouter 400s.
    aspect_ratio: "auto",
    size: OUTPUT_SIZE,
    ...(ref
      ? {
          input_references: Array.from({ length: ref.count }, () => ({
            type: "image_url",
            image_url: { url: ref.dataUrl },
          })),
        }
      : {}),
  };

  const started = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Bloom reference-cost experiment",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { _nonJson: raw.slice(0, 500) };
  }
  const durationMs = Date.now() - started;

  if (!res.ok) {
    return { edge, error: `${res.status} ${res.statusText}`, detail: raw.slice(0, 400) };
  }

  const first = Array.isArray(data?.data) ? data.data[0] : null;
  const outBytes = first?.b64_json ? Buffer.from(first.b64_json, "base64").length : 0;

  return {
    edge,
    refBytes: ref?.bytes ?? 0,
    durationMs,
    cost: data?.usage?.cost ?? null,
    usage: data?.usage ?? null,
    id: data?.id ?? null,
    outBytes,
    b64: first?.b64_json ?? null,
  };
};

const results = [];
for (const edge of LADDER) {
  process.stdout.write(`run ref=${edge} ... `);
  const r = await runOne(edge);
  results.push(r);
  if (r.error) {
    console.log(`ERROR ${r.error} :: ${r.detail}`);
  } else {
    console.log(`$${r.cost} in ${(r.durationMs / 1000).toFixed(1)}s`);
    console.log(`    usage: ${JSON.stringify(r.usage)}`);
    if (r.b64) {
      const safe = edge.replace("*", "x");
      await writeFile(path.resolve(here, `out-${safe}.png`), Buffer.from(r.b64, "base64"));
    }
  }
}

const table = results.map((r) => ({
  ref: r.edge,
  refKB: r.refBytes ? Math.round(r.refBytes / 1024) : 0,
  cost: r.cost,
  prompt_tokens: r.usage?.prompt_tokens ?? null,
  completion_tokens: r.usage?.completion_tokens ?? null,
  seconds: r.durationMs ? +(r.durationMs / 1000).toFixed(1) : null,
  error: r.error ?? null,
}));
console.log("");
console.table(table);
await writeFile(
  path.resolve(here, "ref-cost-results.json"),
  JSON.stringify(
    {
      model: MODEL,
      outputSize: OUTPUT_SIZE,
      results: table,
      raw: results.map((r) => ({ ...r, b64: undefined })),
    },
    null,
    2,
  ),
);
console.log("wrote ref-cost-results.json");
