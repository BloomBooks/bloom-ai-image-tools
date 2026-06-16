// Experiment: can Gemini 3 return, in ONE call, (a) a clean grid of the
// extracted/straightened panels in a predictable order AND (b) the per-panel
// text via the text channel in that same order? If yes, alignment is free.
//
// Run: node tests/experiments/gemini-grid-experiment.mjs
// Requires BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS in the environment.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
// Override with INPUT_IMAGE=/path/to/real-poster.png — the synthetic fixture has
// no real artwork (text cards only), so it can't test picture extraction.
const INPUT = process.env.INPUT_IMAGE
  ? path.resolve(process.env.INPUT_IMAGE)
  : path.resolve(here, "..", "fixtures", "comic-sample.png");
const OUT_IMAGE = path.resolve(here, "output-grid.png");
const OUT_TEXT = path.resolve(here, "output-text.txt");

const MODEL = process.env.EXPERIMENT_MODEL || "google/gemini-3.1-flash-image-preview";
const KEY = process.env.BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS;

const PROMPT = `This image is a single page containing several separate illustrated panels (a comic / instructional poster). Do TWO things.

1) IMAGE OUTPUT: For each panel, extract ONLY the illustration/artwork. Do NOT include the panel's caption text or any other lettering, words, or numbers in the picture — leave the artwork clean with no text on it. Do NOT draw any border, frame, box, card edge, or outline of any kind around the pictures. Straighten each illustration upright. Place the clean illustrations on a pure white background, arranged in a tidy grid with LARGE, generous white gutters between them so that every illustration is clearly separated and none of them touch or share an edge. Use a strict, predictable order: the same reading order as the original page — left to right, then top to bottom. Keep each illustration faithful to the source artwork.

2) TEXT OUTPUT (your normal text response, NOT drawn into the image): return ONLY a JSON array of objects, exactly one per panel, in the SAME order as the grid you produced (reading order). Each object is {"text": "<caption>", "box": [x0, y0, x1, y1]} where "text" is the caption transcribed verbatim (preserve wording, spelling, punctuation) with layout line-wraps joined into single spaces (empty string if the panel has no caption), and "box" is that illustration's bounding box IN THE IMAGE YOU PRODUCED as integers from 0 to 1000 (x0=left, y0=top, x1=right, y1=bottom; 0,0 = top-left corner). Output nothing else — no explanation, no markdown code fences.`;

if (!KEY) {
  console.error("Missing BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS");
  process.exit(1);
}

const bytes = await readFile(INPUT);
const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;

const body = {
  model: MODEL,
  modalities: ["image", "text"],
  stream: false,
  max_tokens: 64000,
  image_config: { aspect_ratio: "4:3", image_size: "2K" },
  ...(process.env.REASONING ? { reasoning: { effort: process.env.REASONING, exclude: true } } : {}),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ],
};

console.log(`Calling ${MODEL} ...`);
const started = Date.now();
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    "X-Title": "Bloom grid experiment",
  },
  body: JSON.stringify(body),
});

const raw = await res.text();
let data;
try {
  data = JSON.parse(raw);
} catch {
  console.error("Non-JSON response:", raw.slice(0, 800));
  process.exit(1);
}

if (!res.ok) {
  console.error(`HTTP ${res.status}:`, JSON.stringify(data?.error ?? data, null, 2).slice(0, 800));
  process.exit(1);
}

const choice = data?.choices?.[0];
const msg = choice?.message ?? {};
const contentText =
  typeof msg.content === "string"
    ? msg.content
    : Array.isArray(msg.content)
      ? msg.content.map((p) => (typeof p === "string" ? p : (p?.text ?? ""))).join("\n")
      : "";

console.log(`\n--- meta (${Date.now() - started}ms) ---`);
console.log({
  model: data?.model,
  finish_reason: choice?.finish_reason,
  native_finish_reason: choice?.native_finish_reason,
  hasImage: Array.isArray(msg.images) ? msg.images.length : 0,
  cost: data?.usage?.cost,
  usage: data?.usage,
});

// Save image.
const imageUrl = Array.isArray(msg.images) ? msg.images[0]?.image_url?.url : null;
if (imageUrl?.startsWith("data:image")) {
  const b64 = imageUrl.split(",")[1];
  await writeFile(OUT_IMAGE, Buffer.from(b64, "base64"));
  console.log(`\nSaved grid image -> ${OUT_IMAGE}`);
} else {
  console.log("\nNo image returned.");
}

console.log("\n--- TEXT CHANNEL (raw) ---");
console.log(contentText);

await writeFile(OUT_TEXT, contentText);

// Parse the JSON array of {text, box}.
const OUT_BOXES = path.resolve(here, "output-boxes.json");
const match = contentText.match(/\[[\s\S]*\]/);
if (match) {
  try {
    const arr = JSON.parse(match[0]);
    console.log(`\n--- PARSED ${Array.isArray(arr) ? arr.length : "?"} ENTRIES ---`);
    if (Array.isArray(arr)) {
      arr.forEach((entry, i) => {
        const text = typeof entry?.text === "string" ? entry.text : entry;
        const box = entry?.box ? JSON.stringify(entry.box) : "(no box)";
        console.log(`[${i}] box=${box}  ${String(text).slice(0, 60)}`);
      });
      await writeFile(OUT_BOXES, JSON.stringify(arr, null, 2));
      console.log(`\nSaved boxes -> ${OUT_BOXES}`);
    }
  } catch (e) {
    console.log("\nFound a [...] block but it did not parse as JSON:", String(e));
  }
} else {
  console.log("\nNo JSON array found in text channel.");
}
