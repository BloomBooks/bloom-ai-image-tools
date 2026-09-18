// Reports which of the editor's translatable strings the Crowdin screenshots cover.
//
//   node dev/screenshotsCoverage.mjs            write screenshots-out/coverage.md and print totals
//   node dev/screenshotsCoverage.mjs --verbose  also print every tag of every scene
//
// Reads what `pnpm screenshots:capture` wrote to screenshots-out/.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(repoRoot, "screenshots-out");
const verbose = process.argv.includes("--verbose");

const table = JSON.parse(readFileSync(join(outDir, "strings.json"), "utf8"));
const scenes = readdirSync(outDir)
  .filter(
    (f) =>
      f.endsWith(".json") &&
      ![
        "strings.json",
        "upload-report.json",
        "upload-manifest.json",
        "crowdin-string-ids.json",
      ].includes(f),
  )
  .map((f) => JSON.parse(readFileSync(join(outDir, f), "utf8")))
  .sort((a, b) => a.name.localeCompare(b.name));

const scenesById = new Map();
for (const scene of scenes) {
  for (const tag of scene.tags) {
    if (!scenesById.has(tag.id)) scenesById.set(tag.id, []);
    scenesById.get(tag.id).push({ scene: scene.name, tag });
  }
  if (verbose) {
    console.log(`\n== ${scene.name} (${scene.width}x${scene.height}) — ${scene.tags.length} tags`);
    for (const t of scene.tags) {
      console.log(
        `  ${t.via.padEnd(11)} ${String(t.x).padStart(5)} ${String(t.y).padStart(5)} ${String(t.width).padStart(4)} ${String(t.height).padStart(3)}  ${t.id.padEnd(52)} ${JSON.stringify(t.text).slice(0, 70)}`,
      );
    }
    if (scene.unmatched.length) {
      console.log(`  unmatched (${scene.unmatched.length}):`);
      for (const u of scene.unmatched) console.log(`    ${JSON.stringify(u).slice(0, 120)}`);
    }
  }
}

const ids = Object.keys(table).sort();
const tagged = ids.filter((id) => scenesById.has(id));
const untagged = ids.filter((id) => !scenesById.has(id));
const unknownIds = [...scenesById.keys()].filter((id) => !(id in table));

const groupOf = (id) => id.split(".").slice(0, 2).join(".");
const groups = new Map();
for (const id of untagged) {
  const g = groupOf(id);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(id);
}

// Tags that only came from an alt attribute, or whose text is not the table's English
// (a template with values filled in, or a collision), deserve a look.
const suspicious = [];
for (const [id, hits] of scenesById) {
  for (const { scene, tag } of hits) {
    const english = table[id];
    const isTemplate = english && /\{\d\}/.test(english);
    const shown = tag.text.replace(/^\d+\)\s+/, "");
    if (
      tag.via === "alt" ||
      (!isTemplate && english && shown !== english.replace(/\s+/g, " ").trim())
    ) {
      suspicious.push({ id, scene, tag });
    }
  }
}

const percent = ids.length ? Math.round((tagged.length / ids.length) * 100) : 0;
const lines = [];
lines.push(`# Crowdin screenshot coverage`);
lines.push(``);
lines.push(`Generated ${new Date().toISOString()} from ${scenes.length} scenes.`);
lines.push(``);
lines.push(`| | count |`);
lines.push(`|---|---|`);
lines.push(`| translatable strings | ${ids.length} |`);
lines.push(`| shown on at least one screenshot | ${tagged.length} (${percent}%) |`);
lines.push(`| not shown anywhere | ${untagged.length} |`);
lines.push(``);
lines.push(`## Per scene`);
lines.push(``);
lines.push(`| scene | tags | unmatched texts |`);
lines.push(`|---|---|---|`);
for (const s of scenes) lines.push(`| ${s.name} | ${s.tags.length} | ${s.unmatched.length} |`);
lines.push(``);
lines.push(`## Not shown on any screenshot`);
lines.push(``);
for (const [g, list] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`### ${g} (${list.length})`);
  lines.push(``);
  for (const id of list) lines.push(`- \`${id}\` — ${JSON.stringify(table[id])}`);
  lines.push(``);
}
if (suspicious.length) {
  lines.push(`## Worth a look`);
  lines.push(``);
  lines.push(`Tagged from an \`alt\` attribute, or with text that differs from the English.`);
  lines.push(``);
  for (const { id, scene, tag } of suspicious) {
    lines.push(`- \`${id}\` in ${scene} via ${tag.via}: ${JSON.stringify(tag.text)}`);
  }
  lines.push(``);
}
if (unknownIds.length) {
  lines.push(`## Tagged ids missing from the string table`);
  lines.push(``);
  for (const id of unknownIds) lines.push(`- \`${id}\``);
  lines.push(``);
}

writeFileSync(join(outDir, "coverage.md"), lines.join("\n"));
console.log(
  `\n${tagged.length} of ${ids.length} translatable strings (${percent}%) appear on ${scenes.length} screenshots; ${untagged.length} do not. Details: screenshots-out/coverage.md`,
);
