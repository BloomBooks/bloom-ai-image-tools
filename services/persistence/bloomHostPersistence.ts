import { ImageToolsStatePersistence, PersistedImageToolsState } from "../../types";
import { IMAGE_TOOLS_STATE_VERSION } from "./constants";
import { prepareStateForPersistence, restoreStateFromPersistence } from "./stateTransforms";
import { BloomHostBridge } from "../host/BloomHostBridge";

interface ConnectionJson {
  apiKey: string | null;
  authMethod: "oauth" | "manual" | null;
  openRouterUser?: string | null;
}

const historyImageFile = (id: string) => `history/${id}.png`;
const isPersistableImageData = (imageData: string | null | undefined): imageData is string =>
  typeof imageData === "string" && imageData.startsWith("data:image/");

export const createBloomHostPersistence = (bridge: BloomHostBridge): ImageToolsStatePersistence => {
  const lastSavedImageData = new Map<string, string>();

  const load = async (): Promise<PersistedImageToolsState | null> => {
    try {
      const raw = await bridge.getFile("state.json");
      if (!raw) return null;

      const data = JSON.parse(raw) as PersistedImageToolsState;
      if (data.version !== IMAGE_TOOLS_STATE_VERSION) return null;

      const restored = restoreStateFromPersistence(data);

      const hydratedHistory = await Promise.all(
        restored.appState.history.map(async (item) => {
          if (item.imageData) {
            if (isPersistableImageData(item.imageData)) {
              lastSavedImageData.set(item.id, item.imageData);
            }
            return item;
          }
          const imageData = await bridge.getFile(historyImageFile(item.id));
          if (!imageData) return item;
          if (isPersistableImageData(imageData)) {
            lastSavedImageData.set(item.id, imageData);
          }
          return { ...item, imageData };
        }),
      );

      const hydratedState: PersistedImageToolsState = {
        ...restored,
        appState: { ...restored.appState, history: hydratedHistory },
      };

      // C3: override auth from connection.json if present
      const connectionRaw = await bridge.getFile("connection.json");
      if (connectionRaw) {
        try {
          const connection = JSON.parse(connectionRaw) as ConnectionJson;
          if (connection.apiKey != null) {
            return {
              ...hydratedState,
              auth: {
                apiKey: connection.apiKey,
                authMethod: connection.authMethod ?? hydratedState.auth?.authMethod ?? null,
              },
            };
          }
        } catch (error) {
          console.warn("Ignoring malformed connection.json", error);
        }
      }

      return hydratedState;
    } catch (error) {
      console.error("Failed to load bloom host persisted state", error);
      return null;
    }
  };

  const save = async (state: PersistedImageToolsState) => {
    try {
      const prepared = prepareStateForPersistence(state);
      const nextImageData = new Map<string, string>();

      const metadataOnlyHistory = prepared.appState.history.map((item) => {
        if (isPersistableImageData(item.imageData)) {
          nextImageData.set(item.id, item.imageData);
          return { ...item, imageData: "" };
        }
        return item;
      });

      const metadataOnlyState: PersistedImageToolsState = {
        ...prepared,
        appState: { ...prepared.appState, history: metadataOnlyHistory },
      };

      const writeOps: Array<Promise<unknown>> = [
        bridge.putFile("state.json", JSON.stringify(metadataOnlyState)),
      ];

      // Write changed history images
      nextImageData.forEach((imageData, id) => {
        if (lastSavedImageData.get(id) !== imageData) {
          writeOps.push(bridge.putFile(historyImageFile(id), imageData));
        }
      });

      // Delete removed history images
      lastSavedImageData.forEach((_, id) => {
        if (!nextImageData.has(id)) {
          writeOps.push(bridge.deleteFile(historyImageFile(id)));
        }
      });

      // C3: persist API key to connection.json
      if (state.auth) {
        const connection: ConnectionJson = {
          apiKey: state.auth.apiKey,
          authMethod: state.auth.authMethod,
        };
        writeOps.push(bridge.putFile("connection.json", JSON.stringify(connection)));
      }

      await Promise.all(writeOps);

      lastSavedImageData.clear();
      nextImageData.forEach((imageData, id) => lastSavedImageData.set(id, imageData));
    } catch (error) {
      console.error("Failed to save bloom host persisted state", error);
    }
  };

  const clear = async () => {
    try {
      const raw = await bridge.getFile("state.json");
      if (raw) {
        try {
          const state = JSON.parse(raw) as PersistedImageToolsState;
          const ids = state.appState.history.map((e) => e.id);
          await Promise.all(ids.map((id) => bridge.deleteFile(historyImageFile(id))));
        } catch {
          // ignore malformed state.json
        }
      }
      lastSavedImageData.clear();
      await Promise.allSettled([
        bridge.deleteFile("state.json"),
        bridge.deleteFile("connection.json"),
      ]);
    } catch (error) {
      console.error("Failed to clear bloom host persisted state", error);
    }
  };

  return { load, save, clear };
};
