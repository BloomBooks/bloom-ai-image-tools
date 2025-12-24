import { createStore, del, get, set } from "idb-keyval";
import {
  ImageToolsStatePersistence,
  PersistedImageToolsState,
} from "../../types";
import {
  IMAGE_TOOLS_DB_NAME,
  IMAGE_TOOLS_STATE_KEY,
  IMAGE_TOOLS_STATE_VERSION,
  IMAGE_TOOLS_STORE_NAME,
} from "./constants";
import {
  prepareStateForPersistence,
  restoreStateFromPersistence,
} from "./stateTransforms";

const createIdbStore = () => {
  if (typeof window === "undefined") {
    return null;
  }
  return createStore(IMAGE_TOOLS_DB_NAME, IMAGE_TOOLS_STORE_NAME);
};

export const createBrowserImageToolsPersistence = (): ImageToolsStatePersistence => {
  const store = createIdbStore();

  const load = async (): Promise<PersistedImageToolsState | null> => {
    if (!store) return null;
    try {
      const data = (await get(IMAGE_TOOLS_STATE_KEY, store)) as
        | PersistedImageToolsState
        | undefined;
      if (!data) return null;
      if (data.version !== IMAGE_TOOLS_STATE_VERSION) {
        await del(IMAGE_TOOLS_STATE_KEY, store);
        return null;
      }
      return restoreStateFromPersistence(data);
    } catch (error) {
      console.error("Failed to load persisted image tools state", error);
      return null;
    }
  };

  const save = async (state: PersistedImageToolsState) => {
    if (!store) return;
    try {
      await set(
        IMAGE_TOOLS_STATE_KEY,
        prepareStateForPersistence(state),
        store
      );
    } catch (error) {
      console.error("Failed to persist image tools state", error);
    }
  };

  const clear = async () => {
    if (!store) return;
    try {
      await del(IMAGE_TOOLS_STATE_KEY, store);
    } catch (error) {
      console.error("Failed to clear persisted image tools state", error);
    }
  };

  return { load, save, clear };
};
