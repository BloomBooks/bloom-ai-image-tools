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
  const fileStore = new Map<string, string>();

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
    openExternalUrl() {},
    async getFile(name) {
      return fileStore.get(name) ?? null;
    },
    async putFile(name, data) {
      fileStore.set(name, data);
    },
    async deleteFile(name) {
      fileStore.delete(name);
    },
    async clearAllFiles() {
      fileStore.clear();
    },
  };

  return { bridge, fileStore };
};

describe("createBloomHostPersistence", () => {
  it("splits imageData out of state.json into history/<id>.png", async () => {
    const { bridge, fileStore } = createBridge();
    const persistence = createBloomHostPersistence(bridge);
    const state = createState();

    await persistence.save(state);

    const savedMeta = JSON.parse(fileStore.get("state.json")!) as PersistedImageToolsState;
    expect(savedMeta.appState.history[0]?.imageData).toBe("");
    expect(fileStore.get("history/history-1.png")).toBe("data:image/png;base64,abc");
  });

  it("hydrates imageData from history/<id>.png on load", async () => {
    const { bridge } = createBridge();
    const persistence = createBloomHostPersistence(bridge);
    const state = createState();

    await persistence.save(state);
    const restored = await persistence.load();

    expect(restored?.appState.history[0]?.imageData).toBe("data:image/png;base64,abc");
  });

  it("prepares saved state and restores legacy book image naming on load", async () => {
    const { bridge, fileStore } = createBridge();
    const persistence = createBloomHostPersistence(bridge);
    const state = createState();

    await persistence.save(state);

    const savedMeta = JSON.parse(fileStore.get("state.json")!) as PersistedImageToolsState;
    expect(savedMeta.thumbnailStrips?.activeStripId).toBe("bookImages");
    expect(savedMeta.appState.history[0]?.origin).toBe("bookImages");
    expect(savedMeta.replacementImageIdByIncomingId).toEqual({ "history-1": "history-1" });

    // Simulate loading legacy "environment" naming from state.json
    fileStore.set(
      "state.json",
      JSON.stringify({
        ...state,
        thumbnailStrips: {
          activeStripId: "environment",
          pinnedStripIds: ["environment"],
          itemIdsByStrip: {
            history: ["history-1"],
            characters: [],
            starred: [],
            reference: [],
            bookImages: [],
            environment: ["history-1"],
          },
        },
        appState: {
          ...state.appState,
          history: [{ ...state.appState.history[0], origin: "environment", imageData: "" }],
        },
      }),
    );

    const restored = await persistence.load();
    expect(restored?.thumbnailStrips?.activeStripId).toBe("bookImages");
    expect(restored?.thumbnailStrips?.pinnedStripIds).toEqual(["bookImages"]);
    expect(restored?.thumbnailStrips?.itemIdsByStrip.bookImages).toEqual(["history-1"]);
    expect(restored?.appState.history[0]?.origin).toBe("bookImages");
    expect(restored?.replacementImageIdByIncomingId).toEqual({ "history-1": "history-1" });
  });

  it("persists apiKey to connection.json and loads it back", async () => {
    const { bridge, fileStore } = createBridge();
    const persistence = createBloomHostPersistence(bridge);
    const state = {
      ...createState(),
      auth: { apiKey: "sk-test-key", authMethod: "manual" as const },
    };

    await persistence.save(state);

    const connection = JSON.parse(fileStore.get("connection.json")!);
    expect(connection.apiKey).toBe("sk-test-key");

    const restored = await persistence.load();
    expect(restored?.auth.apiKey).toBe("sk-test-key");
  });

  it("connection.json apiKey takes precedence over state.json auth on load", async () => {
    const { bridge, fileStore } = createBridge();
    const persistence = createBloomHostPersistence(bridge);
    const state = createState();
    await persistence.save(state);

    // Manually set a different key in connection.json
    fileStore.set(
      "connection.json",
      JSON.stringify({ apiKey: "from-connection", authMethod: "manual" }),
    );

    const restored = await persistence.load();
    expect(restored?.auth.apiKey).toBe("from-connection");
  });

  it("clears state.json, connection.json, and history images", async () => {
    const { bridge, fileStore } = createBridge();
    const persistence = createBloomHostPersistence(bridge);

    await persistence.save(createState());
    expect(fileStore.has("state.json")).toBe(true);
    expect(fileStore.has("history/history-1.png")).toBe(true);

    await persistence.clear();

    expect(fileStore.has("state.json")).toBe(false);
    expect(fileStore.has("history/history-1.png")).toBe(false);
    expect(fileStore.has("connection.json")).toBe(false);
  });
});
