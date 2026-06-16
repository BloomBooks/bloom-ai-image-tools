// Drives the break-comic tool through the REAL UI in the persistent CDP
// Chrome (launched separately with --remote-debugging-port=9222).
//
// Run: node tests/experiments/cdp-run.mjs [runLabel]
// Env: REASONING_LEVEL=default|low|medium|high (sets the per-model reasoning
//      level in localStorage before the run; "default" removes the override)
//
// Captures, per run, into tests/experiments/runs/<label>/:
//   - console.log            all [break-comic]/[openRouter]/error/warning lines,
//                            with console objects fully expanded as JSON
//   - response-<n>.json      each /chat/completions response (image bytes
//                            replaced with "<image N bytes>")
//   - response-<n>-img-<m>.png  every image the model returned, in order
//
// Leaves the page/app open afterwards for human inspection.

import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] || `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const RUN_DIR = path.resolve(here, "runs", label);
mkdirSync(RUN_DIR, { recursive: true });
const LOG = path.join(RUN_DIR, "console.log");
writeFileSync(LOG, "");

const POSTER = "C:\\Users\\hatto\\Downloads\\bloom-ai-28rj0ng.png";
const API_KEY =
  process.env.SIL_BLOOM_DOCS_OPEN_ROUTER ||
  process.env.BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS ||
  "";
const REASONING_LEVEL = process.env.REASONING_LEVEL || "default";

if (!API_KEY) {
  console.error("No OpenRouter API key in env.");
  process.exit(1);
}

const log = (line) => {
  appendFileSync(LOG, line + "\n");
  console.log(line);
};

const browser = await chromium.connectOverCDP("http://localhost:9222");
const context = browser.contexts()[0];
let page = context.pages().find((p) => p.url().startsWith("http://localhost:3000"));
if (!page) {
  page = await context.newPage();
}

// --- console capture (expand object args to JSON) ---
let done = null;
const finished = new Promise((resolve) => (done = resolve));
page.on("console", async (msg) => {
  const text = msg.text();
  const interesting =
    text.includes("[break-comic]") ||
    text.includes("[openRouter]") ||
    text.includes("[ExtractCast/debug]") ||
    msg.type() === "error" ||
    msg.type() === "warning";
  if (!interesting) return;
  let expanded = text;
  try {
    const vals = await Promise.all(
      msg.args().map((a) => a.jsonValue().catch(() => "<unserializable>")),
    );
    expanded = vals.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ");
  } catch {
    // keep plain text
  }
  log(`[${msg.type()}] ${expanded}`);
  if (text.includes("PIECES CREATED")) done("pieces-created");
  if (text.includes("Failed to apply tool")) done("apply-failed");
});
page.on("pageerror", (e) => log(`[pageerror] ${e.message}`));

// --- network capture of OpenRouter responses ---
let responseIndex = 0;
page.on("response", async (res) => {
  if (!res.url().includes("openrouter.ai/api/v1/chat/completions")) return;
  const n = ++responseIndex;
  try {
    const data = await res.json();
    const choice = data?.choices?.[0];
    const images = choice?.message?.images;
    if (Array.isArray(images)) {
      images.forEach((img, m) => {
        const url = img?.image_url?.url;
        if (typeof url === "string" && url.startsWith("data:image")) {
          const b64 = url.split(",")[1] || "";
          writeFileSync(
            path.join(RUN_DIR, `response-${n}-img-${m + 1}.png`),
            Buffer.from(b64, "base64"),
          );
          img.image_url.url = `<image ${b64.length} b64 chars>`;
        }
      });
    }
    writeFileSync(path.join(RUN_DIR, `response-${n}.json`), JSON.stringify(data, null, 2));
    log(`[net] saved response-${n}.json (images: ${Array.isArray(images) ? images.length : 0})`);
  } catch (e) {
    log(`[net] failed to capture response ${n}: ${e}`);
  }
});

// --- app setup ---
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  sessionStorage.setItem("imageTools.skipEnvKey", "1");
  sessionStorage.setItem("imageTools.skipWelcomeDialog", "1");
});

// Persist key + auth method directly (the settings UI does the same).
await page.evaluate(
  ({ key }) => {
    localStorage.setItem("openrouter.apiKey", key);
    localStorage.setItem("openrouter.authMethod", "manual");
  },
  { key: API_KEY },
);

// Reasoning level override for Gemini 3 Pro (mirrors the per-model UI setting).
await page.evaluate((level) => {
  const RAW = localStorage.getItem("imageToolsAppState.v1");
  if (!RAW) return "no persisted app state yet";
  try {
    const state = JSON.parse(RAW);
    state.modelReasoningLevels = state.modelReasoningLevels || {};
    if (level === "default") {
      delete state.modelReasoningLevels["google/gemini-3-pro-image-preview"];
    } else {
      state.modelReasoningLevels["google/gemini-3-pro-image-preview"] = level;
    }
    localStorage.setItem("imageToolsAppState.v1", JSON.stringify(state));
    return "ok";
  } catch (e) {
    return String(e);
  }
}, REASONING_LEVEL);

await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

// Dismiss welcome dialog if it still shows.
const dismiss = page.getByRole("button", { name: "I just want to look around" });
if (await dismiss.isVisible().catch(() => false)) {
  await dismiss.click();
}

// Select Gemini 3 Pro.
await page.getByRole("button", { name: /^Model:/i }).click();
await page.getByText("Gemini 3 Pro", { exact: false }).first().click();
await page.getByRole("button", { name: /^OK$/ }).click();

// Open the break-comic tool and upload the poster.
await page.getByRole("button", { name: "More" }).first().click();
await page.locator('[data-tool-id="break_comic_into_images"]').click();
await page.getByTestId("target-upload-input").setInputFiles(POSTER);
await page
  .getByTestId("target-panel")
  .locator('img[alt="Original Comic"]')
  .waitFor({ state: "visible", timeout: 10_000 });

log(
  `=== RUN ${label} | reasoning=${REASONING_LEVEL} | starting at ${new Date().toISOString()} ===`,
);
await page.getByRole("button", { name: /Break into Images/i }).click();

const outcome = await Promise.race([finished, page.waitForTimeout(360_000).then(() => "timeout")]);
log(`=== OUTCOME: ${outcome} ===`);

// Give post-run logs a moment to flush.
await page.waitForTimeout(3000);
await browser.close(); // detaches CDP; the persistent Chrome stays open
console.log(`\nRun dir: ${RUN_DIR}`);
process.exit(0);
