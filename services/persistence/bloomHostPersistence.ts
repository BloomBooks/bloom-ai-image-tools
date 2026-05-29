import { ImageToolsStatePersistence, PersistedImageToolsState } from "../../types";
import { prepareStateForPersistence, restoreStateFromPersistence } from "./stateTransforms";
import { BloomHostBridge } from "../host/BloomHostBridge";

export const createBloomHostPersistence = (
  bridge: BloomHostBridge,
  namespace: string,
): ImageToolsStatePersistence => {
  return {
    async load() {
      const state = await bridge.loadState(namespace);
      return state ? restoreStateFromPersistence(state) : null;
    },
    async save(state: PersistedImageToolsState) {
      await bridge.saveState(namespace, prepareStateForPersistence(state));
    },
    async clear() {
      await bridge.clearState(namespace);
    },
  };
};
