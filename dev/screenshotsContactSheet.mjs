// Writes screenshots-out/index.html: every captured screenshot with its tag rectangles drawn
// on top, so a person can check what would be sent to Crowdin.
//
//   node dev/screenshotsContactSheet.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(repoRoot, "screenshots-out");
const reserved = new Set([
  "strings.json",
  "upload-report.json",
  "upload-manifest.json",
  "crowdin-string-ids.json",
]);

const escape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

const scenes = readdirSync(outDir)
  .filter((f) => f.endsWith(".json") && !reserved.has(f))
  .map((f) => JSON.parse(readFileSync(join(outDir, f), "utf8")))
  .sort((a, b) => a.name.localeCompare(b.name));

const sections = scenes.map((scene) => {
  const boxes = scene.tags
    .map(
      (t) =>
        `<a class="tag ${t.via}" style="left:${(t.x / scene.width) * 100}%;top:${(t.y / scene.height) * 100}%;width:${(t.width / scene.width) * 100}%;height:${(t.height / scene.height) * 100}%" title="${escape(t.id)} (${t.via})&#10;${escape(t.text)}"></a>`,
    )
    .join("");
  return `
  <section id="${escape(scene.name)}">
    <h2>${escape(scene.name)} <small>${scene.width}×${scene.height}, ${scene.tags.length} tags${scene.notes ? " — " + escape(scene.notes) : ""}</small></h2>
    <div class="shot" style="aspect-ratio:${scene.width}/${scene.height}">
      <img src="${escape(scene.name)}.png" alt="">
      ${boxes}
    </div>
  </section>`;
});

const nav = scenes
  .map((s) => `<a href="#${escape(s.name)}">${escape(s.name)} <b>${s.tags.length}</b></a>`)
  .join("");

writeFileSync(
  join(outDir, "index.html"),
  `<!doctype html>
<meta charset="utf-8">
<title>Crowdin screenshots</title>
<style>
  body { margin: 0; font: 14px system-ui, sans-serif; background: #f4f4f6; color: #222; display: flex; }
  nav { position: sticky; top: 0; height: 100vh; overflow: auto; width: 260px; padding: 12px; box-sizing: border-box; background: #fff; border-right: 1px solid #ddd; }
  nav a { display: flex; justify-content: space-between; gap: 8px; padding: 3px 6px; color: #234; text-decoration: none; border-radius: 4px; }
  nav a:hover { background: #eef; }
  nav b { color: #888; font-weight: 500; }
  main { flex: 1; padding: 16px 24px; }
  h2 { margin: 24px 0 8px; font-size: 16px; }
  small { color: #667; font-weight: normal; }
  .shot { position: relative; max-width: 1280px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
  .shot img { display: block; width: 100%; height: 100%; }
  .tag { position: absolute; box-sizing: border-box; border: 2px solid rgba(255, 60, 60, .9); background: rgba(255, 60, 60, .12); }
  .tag.placeholder { border-color: rgba(255, 160, 0, .9); background: rgba(255, 160, 0, .12); }
  .tag.label { border-color: rgba(30, 140, 255, .9); background: rgba(30, 140, 255, .12); }
  .tag.alt { border-color: rgba(140, 60, 200, .9); background: rgba(140, 60, 200, .12); }
  .tag:hover { background: rgba(255, 255, 0, .35); }
  .legend span { display: inline-block; padding: 2px 8px; margin-right: 8px; border: 2px solid; border-radius: 4px; }
</style>
<nav><h1 style="font-size:15px;margin:4px 6px 10px">${scenes.length} screenshots</h1>${nav}</nav>
<main>
  <p class="legend">Hover a box for its string id.
    <span style="border-color:rgba(255,60,60,.9)">text</span>
    <span style="border-color:rgba(255,160,0,.9)">placeholder</span>
    <span style="border-color:rgba(30,140,255,.9)">title / aria-label</span>
    <span style="border-color:rgba(140,60,200,.9)">alt</span>
  </p>
  ${sections.join("\n")}
</main>
`,
);
console.log(`Wrote ${join(outDir, "index.html")} with ${scenes.length} screenshots`);
