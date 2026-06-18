/**
 * bloomHostPersistence — the editor's state/history store when embedded in Bloom.
 * ===============================================================================
 *
 * Implements the editor's `ImageToolsStatePersistence` (load/save/clear) on top of the
 * `IBloomHostFiles` plane (it only needs file I/O, not the control channel), so that
 * instead of localStorage everything lives in the book's
 * per-book `.ai-image-editor/` folder (served over HTTP by Bloom's AiImageEditorApi).
 * Used by BloomHostedImageEditor; the browser/localStorage variant is used standalone.
 *
 * The split that makes this work:
 *   - state.json        UI-only state (selection, params, auth pointer). History is
 *                       blanked out here — the folder, not state.json, is the source
 *                       of truth for history.
 *   - history/<id>.png  the image bytes (written only when freshly generated; URL-
 *                       backed images already live on disk).
 *   - history/<id>.json a per-image "sidecar" of the record minus its bytes.
 *   - connection.json   the API key / auth method (C3), kept out of state.json.
 *
 * `load` rebuilds history from the host-enumerated folder list (`options.historyImages`),
 * recovering sidecar-less files with sane defaults. `save` diffs against last-written
 * hashes to avoid re-POSTing unchanged bytes/sidecars and to DELETE removed entries.
 * Book images (origin "bookImages") are re-supplied on every launch and are never
 * written into history/.
 */
import { ImageRecord, ImageToolsStatePersistence, PersistedImageToolsState } from "../../types";
import { IMAGE_TOOLS_STATE_VERSION } from "./constants";
import { prepareStateForPersistence, restoreStateFromPersistence } from "./stateTransforms";
import { IBloomHostFiles, IBloomHostHistoryImage } from "../host/BloomHostBridge";

interface ConnectionJson {
  apiKey: string | null;
  authMethod: "oauth" | "manual" | null;
  openRouterUser?: string | null;
}

export interface BloomHostPersistenceOptions {
  /** History enumerated by the host from `.ai-image-editor/history/`. The folder
   *  is the source of truth, so the editor's history is built from this list
   *  rather than from `state.json`. */
  historyImages?: IBloomHostHistoryImage[];
}

const historyImageFile = (id: string) => `history/${id}.png`;
const historySidecarFile = (id: string) => `history/${id}.json`;
const isPersistableImageData = (imageData: string | null | undefined): imageData is string =>
  typeof imageData === "string" && imageData.startsWith("data:image/");

/** Strip the bytes off a history record to produce its `history/<id>.json` sidecar. */
const sidecarJsonFromRecord = (record: ImageRecord): string => {
  const { imageData: _imageData, ...sidecar } = record;
  return JSON.stringify(sidecar);
};

/** A history item for which the host found no sidecar (e.g. a file dropped in by
 *  hand). Mirrors the folder backend's recovery defaults so it still shows up. */
const buildRecoveredRecord = (image: IBloomHostHistoryImage): ImageRecord => ({
  id: image.id,
  parentId: null,
  imageData: image.url,
  imageFileName: null,
  toolId: "unknown",
  parameters: {},
  sourceStyleId: null,
  durationMs: 0,
  cost: 0,
  model: "",
  timestamp: 0,
  promptUsed: "Recovered image",
  sourceSummary: "Recovered from history folder",
  resolution: undefined,
  isStarred: false,
  origin: "generated",
});

const buildHistoryRecord = (image: IBloomHostHistoryImage): ImageRecord => {
  if (!image.metadata) {
    return buildRecoveredRecord(image);
  }
  // The filename stem is authoritative for the id and the URL for the bytes,
  // so they win over whatever the sidecar happened to record.
  return { ...image.metadata, id: image.id, imageData: image.url };
};

/** Build the editor's history from the host-enumerated folder, oldest-first
 *  (app state keeps history oldest-first; the strip reverses it for display). */
const buildHistoryFromImages = (images: IBloomHostHistoryImage[]): ImageRecord[] =>
  images.map(buildHistoryRecord).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

const createEmptyUiState = (): PersistedImageToolsState => ({
  version: IMAGE_TOOLS_STATE_VERSION,
  appState: {
    targetImageId: null,
    referenceImageIds: [],
    rightPanelImageId: null,
    history: [],
  },
  paramsByTool: {},
  activeToolId: null,
  auth: { apiKey: null, authMethod: null },
});

export const createBloomHostPersistence = (
  bridge: IBloomHostFiles,
  options?: BloomHostPersistenceOptions,
): ImageToolsStatePersistence => {
  const historyImages = options?.historyImages ?? [];

  // Bytes already written to history/<id>.png (data URLs only — URL-backed
  // entries already live on disk), keyed by id, for write-dedup on save.
  const lastSavedImageData = new Map<string, string>();
  // Sidecar JSON already on disk, keyed by id. Seeded from the host enumeration
  // so the first save doesn't rewrite unchanged sidecars, and so deletions can
  // be detected for URL-backed entries (which never appear in lastSavedImageData).
  const lastSavedSidecar = new Map<string, string>();
  historyImages.forEach((image) => {
    if (image.metadata) {
      lastSavedSidecar.set(image.id, JSON.stringify(image.metadata));
    }
  });

  const load = async (): Promise<PersistedImageToolsState | null> => {
    try {
      const history = buildHistoryFromImages(historyImages);

      // state.json now holds UI-only state; any history array in it is ignored.
      let base: PersistedImageToolsState | null = null;
      const raw = await bridge.getFile("state.json");
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedImageToolsState;
        if (parsed.version === IMAGE_TOOLS_STATE_VERSION) {
          base = restoreStateFromPersistence({
            ...parsed,
            appState: { ...parsed.appState, history: [] },
          });
        }
      }

      if (!base && history.length === 0) {
        return null;
      }

      const resolved = base ?? createEmptyUiState();
      let result: PersistedImageToolsState = {
        ...resolved,
        appState: { ...resolved.appState, history },
      };

      // C3: override auth from connection.json if present.
      const connectionRaw = await bridge.getFile("connection.json");
      if (connectionRaw) {
        try {
          const connection = JSON.parse(connectionRaw) as ConnectionJson;
          if (connection.apiKey != null) {
            result = {
              ...result,
              auth: {
                apiKey: connection.apiKey,
                authMethod: connection.authMethod ?? result.auth?.authMethod ?? null,
              },
            };
          }
        } catch (error) {
          console.warn("Ignoring malformed connection.json", error);
        }
      }

      return result;
    } catch (error) {
      console.error("Failed to load bloom host persisted state", error);
      return null;
    }
  };

  const save = async (state: PersistedImageToolsState) => {
    try {
      const prepared = prepareStateForPersistence(state);
      // Book images are re-supplied by the host in `init` on every launch and live
      // in history only transiently; they must not be written into history/.
      const history = prepared.appState.history.filter((item) => item.origin !== "bookImages");

      const currentIds = new Set<string>();
      const nextImageData = new Map<string, string>();
      const nextSidecar = new Map<string, string>();

      history.forEach((item) => {
        currentIds.add(item.id);
        nextSidecar.set(item.id, sidecarJsonFromRecord(item));
        if (isPersistableImageData(item.imageData)) {
          nextImageData.set(item.id, item.imageData);
        }
      });

      // state.json keeps only UI state; the folder is the source of truth for history.
      const uiOnlyState: PersistedImageToolsState = {
        ...prepared,
        appState: { ...prepared.appState, history: [] },
      };

      const writeOps: Array<Promise<unknown>> = [
        bridge.putFile("state.json", JSON.stringify(uiOnlyState)),
      ];

      // Write changed image bytes (only freshly generated data-URL images; URL-backed
      // entries are already on disk).
      nextImageData.forEach((imageData, id) => {
        if (lastSavedImageData.get(id) !== imageData) {
          writeOps.push(bridge.putFile(historyImageFile(id), imageData));
        }
      });

      // Write changed sidecars.
      nextSidecar.forEach((json, id) => {
        if (lastSavedSidecar.get(id) !== json) {
          writeOps.push(bridge.putFile(historySidecarFile(id), json));
        }
      });

      // Delete both files for removed history items.
      lastSavedSidecar.forEach((_, id) => {
        if (!currentIds.has(id)) {
          writeOps.push(bridge.deleteFile(historyImageFile(id)));
          writeOps.push(bridge.deleteFile(historySidecarFile(id)));
        }
      });

      // C3: persist API key to connection.json.
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
      lastSavedSidecar.clear();
      nextSidecar.forEach((json, id) => lastSavedSidecar.set(id, json));
    } catch (error) {
      console.error("Failed to save bloom host persisted state", error);
    }
  };

  const clear = async () => {
    try {
      const ids = new Set<string>([...lastSavedSidecar.keys(), ...lastSavedImageData.keys()]);
      historyImages.forEach((image) => ids.add(image.id));
      const deletions: Array<Promise<unknown>> = [];
      ids.forEach((id) => {
        deletions.push(bridge.deleteFile(historyImageFile(id)));
        deletions.push(bridge.deleteFile(historySidecarFile(id)));
      });
      await Promise.allSettled(deletions);

      lastSavedImageData.clear();
      lastSavedSidecar.clear();
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
