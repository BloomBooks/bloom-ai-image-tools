import { describe, expect, it } from "vite-plus/test";
import { createBloomHostPersistence } from "../bloomHostPersistence";
import { BloomHostBridge } from "../../host/BloomHostBridge";
import { PersistedImageToolsState } from "../../../types";

const createState = (): PersistedImageToolsState => ({
  version: 1,
  appState: {
    targetImageId: "history-1",
    referenceImageIds: [],
    rightPanelImageId: null,
    history: [
      {
        id: "history-1",
        parentId: null,
        incomingSlotId: "book-image-1",
        imageData: "data:image/png;base64,abc",
        toolId: "target-upload",
        parameters: {},
        durationMs: 0,
        cost: 0,
        model: "manual",
        timestamp: 1,
        promptUsed: "",
        origin: "bookImages",
      },
    ],
  },
  replacementImageIdByIncomingId: {
    "history-1": "history-1",
  },
  paramsByTool: {},
  activeToolId: null,
  selectedModelId: null,
  auth: {
    apiKey: null,
    authMethod: null,
  },
  thumbnailStrips: {
    activeStripId: "bookImages",
    pinnedStripIds: [],
    itemIdsByStrip: {
      history: ["history-1"],
      characters: [],
      starred: [],
      reference: [],
      bookImages: ["history-1"],
    },
  },
});

const createBridge = () => {
  const storage = new Map<string, PersistedImageToolsState>();

  const bridge: BloomHostBridge = {
    ready() {},
    onInit() {
      return () => {};
    },
    onRequestClose() {
      return () => {};
    },
    async commit() {},
    cancel() {},
    log() {},
    async loadState(namespace) {
      return storage.get(namespace) ?? null;
    },
    async saveState(namespace, state) {
      storage.set(namespace, state);
    },
    async clearState(namespace) {
      storage.delete(namespace);
    },
  };

  return { bridge, storage };
};

describe("createBloomHostPersistence", () => {
  it("prepares saved state and restores legacy book image naming on load", async () => {
    const { bridge, storage } = createBridge();
    const persistence = createBloomHostPersistence(bridge, "test-space");
    const state = createState();

    await persistence.save(state);

    const savedState = storage.get("test-space");
    expect(savedState?.thumbnailStrips?.activeStripId).toBe("bookImages");
    expect(savedState?.appState.history[0]?.origin).toBe("bookImages");
    expect(savedState?.replacementImageIdByIncomingId).toEqual({
      "history-1": "history-1",
    });

    storage.set("test-space", {
      ...state,
      thumbnailStrips: {
        activeStripId: "environment" as never,
        pinnedStripIds: ["environment" as never],
        itemIdsByStrip: {
          history: ["history-1"],
          characters: [],
          starred: [],
          reference: [],
          bookImages: [],
          environment: ["history-1"],
        } as never,
      },
      appState: {
        ...state.appState,
        history: [
          {
            ...state.appState.history[0],
            origin: "environment" as never,
          },
        ],
      },
    });

    const restored = await persistence.load();
    expect(restored?.thumbnailStrips?.activeStripId).toBe("bookImages");
    expect(restored?.thumbnailStrips?.pinnedStripIds).toEqual(["bookImages"]);
    expect(restored?.thumbnailStrips?.itemIdsByStrip.bookImages).toEqual(["history-1"]);
    expect(restored?.appState.history[0]?.origin).toBe("bookImages");
    expect(restored?.replacementImageIdByIncomingId).toEqual({
      "history-1": "history-1",
    });
  });

  it("clears persisted state", async () => {
    const { bridge, storage } = createBridge();
    const persistence = createBloomHostPersistence(bridge, "test-space");

    storage.set("test-space", createState());
    await persistence.clear();

    expect(storage.has("test-space")).toBe(false);
  });
});
