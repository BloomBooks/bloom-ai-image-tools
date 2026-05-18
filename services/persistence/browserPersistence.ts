import { createStore, del, get, set } from "idb-keyval";
import { ImageToolsStatePersistence, PersistedImageToolsState } from "../../types";
import {
  IMAGE_TOOLS_DB_NAME,
  IMAGE_TOOLS_STATE_KEY,
  IMAGE_TOOLS_STATE_VERSION,
  IMAGE_TOOLS_STORE_NAME,
} from "./constants";
import { prepareStateForPersistence, restoreStateFromPersistence } from "./stateTransforms";

const createIdbStore = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return createStore(IMAGE_TOOLS_DB_NAME, IMAGE_TOOLS_STORE_NAME);
};

const IMAGE_TOOLS_STATE_META_KEY = `${IMAGE_TOOLS_STATE_KEY}:meta`;
const historyImageKey = (id: string) => `${IMAGE_TOOLS_STATE_KEY}:history-image:${id}`;

export const createBrowserImageToolsPersistence = (): ImageToolsStatePersistence => {
  const store = createIdbStore();
  const lastSavedImageData = new Map<string, string>();

  const load = async (): Promise<PersistedImageToolsState | null> => {
    if (!store) return null;
    try {
      const data = ((await get(IMAGE_TOOLS_STATE_META_KEY, store)) ||
        (await get(IMAGE_TOOLS_STATE_KEY, store))) as PersistedImageToolsState | undefined;
      if (!data) return null;
      if (data.version !== IMAGE_TOOLS_STATE_VERSION) {
        await del(IMAGE_TOOLS_STATE_META_KEY, store);
        await del(IMAGE_TOOLS_STATE_KEY, store);
        return null;
      }

      const restored = restoreStateFromPersistence(data);
      const hydratedHistory = await Promise.all(
        restored.appState.history.map(async (item) => {
          if (item.imageData) {
            lastSavedImageData.set(item.id, item.imageData);
            return item;
          }

          const persistedImageData = (await get(historyImageKey(item.id), store)) as
            | string
            | undefined;
          if (!persistedImageData) {
            return item;
          }

          lastSavedImageData.set(item.id, persistedImageData);
          return { ...item, imageData: persistedImageData };
        }),
      );

      return {
        ...restored,
        appState: {
          ...restored.appState,
          history: hydratedHistory,
        },
      };
    } catch (error) {
      console.error("Failed to load persisted image tools state", error);
      return null;
    }
  };

  const save = async (state: PersistedImageToolsState) => {
    if (!store) return;
    try {
      const prepared = prepareStateForPersistence(state);
      const nextImageData = new Map<string, string>();
      const metadataOnlyHistory = prepared.appState.history.map((item) => {
        if (item.imageData) {
          nextImageData.set(item.id, item.imageData);
          return { ...item, imageData: "" };
        }
        return item;
      });

      const metadataOnlyState: PersistedImageToolsState = {
        ...prepared,
        appState: {
          ...prepared.appState,
          history: metadataOnlyHistory,
        },
      };

      const writeOps: Array<Promise<unknown>> = [
        set(IMAGE_TOOLS_STATE_META_KEY, metadataOnlyState, store),
        del(IMAGE_TOOLS_STATE_KEY, store),
      ];

      nextImageData.forEach((imageData, id) => {
        if (lastSavedImageData.get(id) === imageData) {
          return;
        }
        writeOps.push(set(historyImageKey(id), imageData, store));
      });

      Array.from(lastSavedImageData.keys()).forEach((id) => {
        if (nextImageData.has(id)) {
          return;
        }
        writeOps.push(del(historyImageKey(id), store));
      });

      await Promise.all(writeOps);

      lastSavedImageData.clear();
      nextImageData.forEach((imageData, id) => {
        lastSavedImageData.set(id, imageData);
      });
    } catch (error) {
      console.error("Failed to persist image tools state", error);
    }
  };

  const clear = async () => {
    if (!store) return;
    try {
      const metadataState = (await get(IMAGE_TOOLS_STATE_META_KEY, store)) as
        | PersistedImageToolsState
        | undefined;
      const historyIds = metadataState?.appState.history.map((item) => item.id) ?? [];
      await Promise.all(historyIds.map((id) => del(historyImageKey(id), store)));
      lastSavedImageData.clear();
      await del(IMAGE_TOOLS_STATE_META_KEY, store);
      await del(IMAGE_TOOLS_STATE_KEY, store);
    } catch (error) {
      console.error("Failed to clear persisted image tools state", error);
    }
  };

  return { load, save, clear };
};
