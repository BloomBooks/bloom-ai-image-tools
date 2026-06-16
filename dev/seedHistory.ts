import { createStore, get, set } from "idb-keyval";
import {
  IMAGE_TOOLS_DB_NAME,
  IMAGE_TOOLS_STATE_KEY,
  IMAGE_TOOLS_STATE_VERSION,
  IMAGE_TOOLS_STORE_NAME,
} from "../services/persistence/constants";
import { ImageRecord, PersistedImageToolsState } from "../types";

const META_KEY = `${IMAGE_TOOLS_STATE_KEY}:meta`;
const historyImageKey = (id: string) => `${IMAGE_TOOLS_STATE_KEY}:history-image:${id}`;

async function toBase64DataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`seedHistory: fetch failed for ${url} (${response.status})`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function seedHistory(
  count = 100,
  imageUrl = "/sample.png",
  options: { reload?: boolean } = {},
): Promise<void> {
  const shouldReload = options.reload !== false;
  const store = createStore(IMAGE_TOOLS_DB_NAME, IMAGE_TOOLS_STORE_NAME);

  console.log(`[seedHistory] Fetching image from ${imageUrl}...`);
  const base64 = await toBase64DataUrl(imageUrl);

  const now = Date.now();
  const items: ImageRecord[] = Array.from({ length: count }, (_, i) => ({
    id: `seed${i}-${Math.random().toString(36).slice(2, 9)}`,
    parentId: null,
    imageData: base64,
    imageFileName: `seed-${i + 1}.png`,
    toolId: "generate",
    parameters: { prompt: `Seed image ${i + 1}` },
    durationMs: 1500,
    cost: 0,
    model: "seed",
    timestamp: now - i * 60_000,
    promptUsed: `Seeded test image ${i + 1} of ${count}`,
    origin: "uploaded" as const,
  }));

  const existing = (await get(META_KEY, store)) as PersistedImageToolsState | undefined;

  const metadataItems = items.map(({ imageData: _d, ...rest }) => ({ ...rest, imageData: "" }));

  const state: PersistedImageToolsState = {
    version: IMAGE_TOOLS_STATE_VERSION,
    appState: {
      targetImageId: null,
      referenceImageIds: [],
      rightPanelImageId: null,
      history: metadataItems,
    },
    paramsByTool: existing?.paramsByTool ?? {},
    activeToolId: existing?.activeToolId ?? null,
    modelByTool: existing?.modelByTool ?? {},
    auth: existing?.auth ?? { apiKey: null, authMethod: null },
    historyNewestFirst: true,
  };

  await set(META_KEY, state, store);
  await Promise.all(items.map((item) => set(historyImageKey(item.id), item.imageData, store)));

  console.log(`[seedHistory] Wrote ${count} items.`);
  if (shouldReload) {
    console.log(`[seedHistory] Reloading...`);
    window.location.reload();
  }
}
