// Uploads the editor's screenshots to Crowdin and tags each one with the strings it shows.
//
//   node dev/uploadCrowdinScreenshots.mjs [--dry-run] [--scene <name>] [--refresh-ids] [--force]
//   node dev/uploadCrowdinScreenshots.mjs --spike [--keep]     prove the mechanism end to end
//
// Needs BLOOM_CROWDIN_TOKEN (a sil-bloom manager or owner token). Reads what
// `pnpm screenshots:capture` wrote to screenshots-out/, and keeps two files there:
//   crowdin-string-ids.json   identifier -> Crowdin string id, for the three Bloom XLF files
//   upload-manifest.json      what each screenshot looked like when last uploaded, so a
//                             re-run only touches what changed
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Crowdin from "@crowdin/crowdin-api-client";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// Looked up on 2026-09-18 with the REST API. sil-bloom is the Crowdin project that
// BloomDesktop's DistFiles/localization/en/*.xlf files sync into; its strings' identifiers
// are the XLF trans-unit ids, which are this editor's l10n ids.
const PROJECT_ID = 261564;
const PROJECT_IDENTIFIER = "sil-bloom";
const MASTER_BRANCH_ID = 27;
const SOURCE_FILE_IDS = {
  "Bloom.xlf": 34,
  "BloomLowPriority.xlf": 74,
  "BloomMediumPriority.xlf": 76,
};
const NAME_PREFIX = "AiImageEditor/";
const RESERVED_JSON = new Set([
  "strings.json",
  "upload-report.json",
  "upload-manifest.json",
  "crowdin-string-ids.json",
]);

// Two strings that were already in Crowdin when the spike was written.
const SPIKE_STRING_IDS = {
  "AiImageEditor.SlotLabel.CanvasBackground": 112819,
  "Common.Close": 10792,
};

const args = new Set(process.argv.slice(2));
const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const outDir = join(repoRoot, argValue("--dir") ?? "screenshots-out");
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const onlyScene = argValue("--scene");

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const readJson = (path, fallback) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

function createClient() {
  const token = process.env.BLOOM_CROWDIN_TOKEN;
  if (!token) {
    console.error("BLOOM_CROWDIN_TOKEN is not set.");
    process.exit(2);
  }
  return new Crowdin.default({ token });
}

async function assertProject(client) {
  const { data } = await client.projectsGroupsApi.getProject(PROJECT_ID);
  if (data.identifier !== PROJECT_IDENTIFIER) {
    throw new Error(
      `Project ${PROJECT_ID} is "${data.identifier}", expected "${PROJECT_IDENTIFIER}". Refusing to touch it.`,
    );
  }
  return data;
}

async function findScreenshotByName(client, name) {
  const { data } = await client.screenshotsApi.listScreenshots(PROJECT_ID, {
    search: name,
    limit: 50,
  });
  return data.map((d) => d.data).find((s) => s.name === name);
}

/** identifier -> { stringId, fileId } for every string in the three Bloom XLF files. */
async function loadStringIdIndex(client, { refresh }) {
  const cachePath = join(outDir, "crowdin-string-ids.json");
  const cached = readJson(cachePath, null);
  const fresh = cached && Date.now() - Date.parse(cached.fetchedAt) < 60 * 60 * 1000;
  if (cached && !refresh && fresh) return cached.byIdentifier;

  const byIdentifier = {};
  for (const [fileName, fileId] of Object.entries(SOURCE_FILE_IDS)) {
    let offset = 0;
    for (;;) {
      const { data } = await client.sourceStringsApi.listProjectStrings(PROJECT_ID, {
        fileId,
        limit: 500,
        offset,
      });
      for (const { data: s } of data) byIdentifier[s.identifier] = { stringId: s.id, fileId };
      if (data.length < 500) break;
      offset += 500;
    }
    console.log(
      `${fileName}: ${Object.values(byIdentifier).filter((v) => v.fileId === fileId).length} strings`,
    );
  }
  writeJson(cachePath, { fetchedAt: new Date().toISOString(), byIdentifier });
  return byIdentifier;
}

function loadScenes() {
  return readdirSync(outDir)
    .filter((f) => f.endsWith(".json") && !RESERVED_JSON.has(f))
    .map((f) => JSON.parse(readFileSync(join(outDir, f), "utf8")))
    .filter((scene) => !onlyScene || scene.name === onlyScene)
    .filter((scene) => existsSync(join(outDir, `${scene.name}.png`)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function uploadScene(client, scene, index, manifest) {
  const name = `${NAME_PREFIX}${scene.name}.png`;
  const png = readFileSync(join(outDir, `${scene.name}.png`));
  const pngSha256 = sha256(png);

  const known = [];
  const notInCrowdin = [];
  for (const tag of scene.tags) {
    const hit = index[tag.id];
    if (hit) {
      known.push({
        id: tag.id,
        stringId: hit.stringId,
        position: { x: tag.x, y: tag.y, width: tag.width, height: tag.height },
      });
    } else {
      notInCrowdin.push(tag.id);
    }
  }
  const tagsSha256 = sha256(JSON.stringify(known));
  const previous = manifest[scene.name];
  const previouslyTagged = new Set(previous?.taggedIds ?? []);
  const newlyKnown = known.filter((t) => !previouslyTagged.has(t.id));

  let action;
  if (force || !previous || previous.pngSha256 !== pngSha256) action = "upload";
  else if (newlyKnown.length || previous.tagsSha256 !== tagsSha256) action = "tags-only";
  else action = "skip";

  const result = {
    name: scene.name,
    action,
    known: known.length,
    notInCrowdin,
    screenshotId: previous?.crowdinScreenshotId,
    webUrl: previous?.webUrl,
    added: 0,
    alreadyTagged: 0,
  };
  if (action === "skip" || dryRun) return result;

  let screenshotId = previous?.crowdinScreenshotId;
  let existing = screenshotId ? null : await findScreenshotByName(client, name);
  if (existing) screenshotId = existing.id;

  if (action === "upload" || !screenshotId) {
    const storage = await client.uploadStorageApi.addStorage(basename(name), png);
    let shot;
    if (screenshotId) {
      shot = await client.screenshotsApi.updateScreenshot(PROJECT_ID, screenshotId, {
        storageId: storage.data.id,
        name,
        usePreviousTags: false,
      });
      // Crowdin's OCR pass first; our positioned tags fill in what it missed.
      await client.screenshotsApi.replaceTags(PROJECT_ID, screenshotId, {
        autoTag: true,
        branchId: MASTER_BRANCH_ID,
      });
    } else {
      shot = await client.screenshotsApi.addScreenshot(PROJECT_ID, {
        storageId: storage.data.id,
        name,
        autoTag: true,
        branchId: MASTER_BRANCH_ID,
      });
      screenshotId = shot.data.id;
    }
    result.webUrl = shot.data.webUrl;
  }
  result.screenshotId = screenshotId;

  const listed = await client.screenshotsApi.listScreenshotTags(PROJECT_ID, screenshotId, {
    limit: 500,
  });
  const alreadyTagged = new Set(listed.data.map((t) => t.data.stringId));
  const toAdd = known.filter((t) => !alreadyTagged.has(t.stringId));
  result.alreadyTagged = known.length - toAdd.length;
  if (toAdd.length) {
    await client.screenshotsApi.addTag(
      PROJECT_ID,
      screenshotId,
      toAdd.map(({ stringId, position }) => ({ stringId, position })),
    );
    result.added = toAdd.length;
  }

  manifest[scene.name] = {
    pngSha256,
    tagsSha256,
    crowdinScreenshotId: screenshotId,
    webUrl: result.webUrl,
    taggedIds: known.map((t) => t.id),
    uploadedAt: new Date().toISOString(),
  };
  return result;
}

async function runUpload(client) {
  await assertProject(client);
  const scenes = loadScenes();
  if (!scenes.length) {
    console.error(`No scenes in ${outDir}. Run pnpm screenshots:capture first.`);
    process.exit(2);
  }
  const manifestPath = join(outDir, "upload-manifest.json");
  const manifest = readJson(manifestPath, {});
  let index = await loadStringIdIndex(client, { refresh: args.has("--refresh-ids") });

  // Refresh the id cache once if a scene names an id it does not know; the strings may have
  // landed since the cache was written.
  const unknownSomewhere = scenes.some((s) => s.tags.some((t) => !index[t.id]));
  if (unknownSomewhere && !args.has("--refresh-ids")) {
    const cached = readJson(join(outDir, "crowdin-string-ids.json"), null);
    if (cached && Date.now() - Date.parse(cached.fetchedAt) > 60 * 60 * 1000) {
      index = await loadStringIdIndex(client, { refresh: true });
    }
  }

  const results = [];
  let failed = false;
  for (const scene of scenes) {
    try {
      const result = await uploadScene(client, scene, index, manifest);
      results.push(result);
      const where = result.webUrl ? "" : "";
      console.log(
        `${result.name.padEnd(44)} ${result.action.padEnd(9)} known ${String(result.known).padStart(3)}  added ${String(result.added).padStart(3)}  already ${String(result.alreadyTagged).padStart(3)}  not in Crowdin ${String(result.notInCrowdin.length).padStart(3)}${where}`,
      );
      if (!dryRun) writeJson(manifestPath, manifest);
    } catch (error) {
      failed = true;
      const body = error?.response?.data ?? error?.error;
      console.error(`${scene.name}: ${error.message ?? error}`);
      if (body) console.error(JSON.stringify(body, null, 2));
      results.push({ name: scene.name, action: "error", error: String(error.message ?? error) });
    }
  }

  const missing = new Map();
  for (const r of results)
    for (const id of r.notInCrowdin ?? []) missing.set(id, (missing.get(id) ?? 0) + 1);
  writeJson(join(outDir, "upload-report.json"), {
    ranAt: new Date().toISOString(),
    dryRun,
    results,
    notInCrowdin: [...missing.keys()].sort((a, b) => a.localeCompare(b)),
  });
  console.log(
    `\n${dryRun ? "Dry run. " : ""}${results.length} screenshots; ${missing.size} distinct ids are not in Crowdin yet (listed in screenshots-out/upload-report.json). ` +
      `Re-run with --refresh-ids after BloomDesktop's XLF changes sync to Crowdin.`,
  );
  if (failed) process.exit(1);
}

async function runSpike(client, { keep }) {
  const project = await assertProject(client);
  console.log(`Project ${project.id} "${project.identifier}" (${project.name})`);

  const fixture = join(repoRoot, "tests", "fixtures", "comic-sample.png");
  const png = readFileSync(fixture);
  const name = `${NAME_PREFIX}spike.png`;

  const storage = await client.uploadStorageApi.addStorage(basename(fixture), png);
  console.log(`Storage ${storage.data.id} (${png.length} bytes)`);

  const existing = await findScreenshotByName(client, name);
  let shot;
  if (existing) {
    shot = await client.screenshotsApi.updateScreenshot(PROJECT_ID, existing.id, {
      storageId: storage.data.id,
      name,
      usePreviousTags: false,
    });
    console.log(`Updated existing screenshot ${shot.data.id} "${shot.data.name}"`);
  } else {
    shot = await client.screenshotsApi.addScreenshot(PROJECT_ID, {
      storageId: storage.data.id,
      name,
      autoTag: false,
    });
    console.log(`Created screenshot ${shot.data.id} "${shot.data.name}"`);
  }
  const id = shot.data.id;
  console.log(`Size ${shot.data.size.width}x${shot.data.size.height}`);

  const tags = Object.entries(SPIKE_STRING_IDS).map(([, stringId], i) => ({
    stringId,
    position: { x: 10 + i * 140, y: 10, width: 120, height: 24 },
  }));
  await client.screenshotsApi.addTag(PROJECT_ID, id, tags);
  const listed = await client.screenshotsApi.listScreenshotTags(PROJECT_ID, id, { limit: 50 });
  const listedIds = listed.data.map((t) => t.data.stringId).sort();
  console.log(`Tags on Crowdin: ${JSON.stringify(listedIds)}`);
  if (listedIds.length !== tags.length) {
    throw new Error(`Expected ${tags.length} tags, Crowdin has ${listedIds.length}`);
  }

  const found = await findScreenshotByName(client, name);
  console.log(`Search by name ${found ? "found id " + found.id : "found nothing"}`);
  console.log(`Look at it: https://crowdin.com/project/${PROJECT_IDENTIFIER}/screenshots`);

  if (keep) {
    console.log("Kept (pass without --keep to delete).");
  } else {
    await client.screenshotsApi.deleteScreenshot(PROJECT_ID, id);
    const after = await findScreenshotByName(client, name);
    console.log(after ? `Delete did not remove ${after.id}!` : "Deleted.");
  }
}

async function main() {
  const client = createClient();
  if (args.has("--spike")) {
    await runSpike(client, { keep: args.has("--keep") });
    return;
  }
  await runUpload(client);
}

main().catch((error) => {
  const body = error?.response?.data ?? error?.error;
  console.error(error.message ?? error);
  if (body) console.error(JSON.stringify(body, null, 2));
  process.exit(1);
});
