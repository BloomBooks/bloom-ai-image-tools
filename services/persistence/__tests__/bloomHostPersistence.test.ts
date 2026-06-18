import { describe, expect, it } from "vite-plus/test";
import { createBloomHostPersistence } from "../bloomHostPersistence";
import { IBloomHostBridge, IBloomHostHistoryImage } from "../../host/BloomHostBridge";
import { HistoryImageSidecar, ImageRecord, PersistedImageToolsState } from "../../../types";

const makeSidecar = (id: string, over: Partial<HistoryImageSidecar> = {}): HistoryImageSidecar => ({
  id,
  parentId: null,
  toolId: "edit-image",
  parameters: {},
  durationMs: 0,
  cost: 0,
  model: "manual",
  timestamp: 0,
  promptUsed: "",
  ...over,
});

const makeRecord = (
  id: string,
  imageData: string,
  over: Partial<ImageRecord> = {},
): ImageRecord => ({
  id,
  parentId: null,
  imageData,
  toolId: "edit-image",
  parameters: {},
  durationMs: 0,
  cost: 0,
  model: "manual",
  timestamp: 0,
  promptUsed: "",
  ...over,
});

const makeUiState = (over: Partial<PersistedImageToolsState> = {}): PersistedImageToolsState => ({
  version: 1,
  appState: {
    targetImageId: null,
    referenceImageIds: [],
    rightPanelImageId: null,
    history: [],
  },
  paramsByTool: {},
  activeToolId: null,
  auth: { apiKey: null, authMethod: null },
  ...over,
});

const createBridge = () => {
  const fileStore = new Map<string, string>();

  const bridge: IBloomHostBridge = {
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
  it("builds history from the host-enumerated folder, ordered by timestamp", async () => {
    const { bridge } = createBridge();
    const historyImages: IBloomHostHistoryImage[] = [
      {
        id: "edit-2",
        url: "https://host/history/edit-2.png",
        metadata: makeSidecar("edit-2", { timestamp: 2000, promptUsed: "second", isStarred: true }),
      },
      {
        id: "edit-1",
        url: "https://host/history/edit-1.png",
        metadata: makeSidecar("edit-1", { timestamp: 1000, promptUsed: "first" }),
      },
      // Orphan: a file dropped into the folder with no sidecar.
      { id: "orphan-1", url: "https://host/history/orphan-1.png" },
    ];
    const persistence = createBloomHostPersistence(bridge, { historyImages });

    const restored = await persistence.load();
    const history = restored?.appState.history ?? [];

    // Oldest-first: orphan (ts 0), edit-1 (1000), edit-2 (2000).
    expect(history.map((item) => item.id)).toEqual(["orphan-1", "edit-1", "edit-2"]);
    // Bytes are referenced by URL, never inlined.
    expect(history.find((item) => item.id === "edit-1")?.imageData).toBe(
      "https://host/history/edit-1.png",
    );
    // Sidecar metadata is preserved.
    expect(history.find((item) => item.id === "edit-2")?.isStarred).toBe(true);
    expect(history.find((item) => item.id === "edit-1")?.promptUsed).toBe("first");
    // Orphan is recovered with sensible defaults.
    expect(history.find((item) => item.id === "orphan-1")?.promptUsed).toBe("Recovered image");
  });

  it("ignores any history array left in state.json and reads only UI state from it", async () => {
    const { bridge, fileStore } = createBridge();
    fileStore.set(
      "state.json",
      JSON.stringify(
        makeUiState({
          appState: {
            targetImageId: "edit-1",
            referenceImageIds: [],
            rightPanelImageId: null,
            history: [makeRecord("ghost", "data:image/png;base64,zzz")],
          },
          activeToolId: "edit-image",
        }),
      ),
    );
    const historyImages: IBloomHostHistoryImage[] = [
      { id: "edit-1", url: "https://host/history/edit-1.png", metadata: makeSidecar("edit-1") },
    ];
    const persistence = createBloomHostPersistence(bridge, { historyImages });

    const restored = await persistence.load();

    expect(restored?.appState.history.map((item) => item.id)).toEqual(["edit-1"]);
    expect(restored?.activeToolId).toBe("edit-image");
  });

  it("returns null when there is no state.json and no enumerated history", async () => {
    const { bridge } = createBridge();
    const persistence = createBloomHostPersistence(bridge, { historyImages: [] });

    expect(await persistence.load()).toBeNull();
  });

  it("writes png + sidecar for a freshly generated image and UI-only state.json", async () => {
    const { bridge, fileStore } = createBridge();
    const persistence = createBloomHostPersistence(bridge, { historyImages: [] });

    await persistence.save(
      makeUiState({
        appState: {
          targetImageId: null,
          referenceImageIds: [],
          rightPanelImageId: null,
          history: [makeRecord("gen-1", "data:image/png;base64,abc", { promptUsed: "hello" })],
        },
      }),
    );

    expect(fileStore.get("history/gen-1.png")).toBe("data:image/png;base64,abc");
    const sidecar = JSON.parse(fileStore.get("history/gen-1.json")!) as HistoryImageSidecar & {
      imageData?: string;
    };
    expect(sidecar.id).toBe("gen-1");
    expect(sidecar.promptUsed).toBe("hello");
    expect(sidecar.imageData).toBeUndefined();

    const savedMeta = JSON.parse(fileStore.get("state.json")!) as PersistedImageToolsState;
    expect(savedMeta.appState.history).toEqual([]);
  });

  it("does not persist book-image entries into the history folder", async () => {
    const { bridge, fileStore } = createBridge();
    const persistence = createBloomHostPersistence(bridge, { historyImages: [] });

    await persistence.save(
      makeUiState({
        appState: {
          targetImageId: null,
          referenceImageIds: [],
          rightPanelImageId: null,
          history: [
            makeRecord("book-image-1", "https://host/book/book-image-1.png", {
              origin: "bookImages",
            }),
            makeRecord("gen-1", "data:image/png;base64,abc", { origin: "generated" }),
          ],
        },
      }),
    );

    expect(fileStore.has("history/book-image-1.json")).toBe(false);
    expect(fileStore.has("history/book-image-1.png")).toBe(false);
    expect(fileStore.has("history/gen-1.json")).toBe(true);
  });

  it("updates a sidecar in place when metadata changes, without rewriting bytes", async () => {
    const { bridge, fileStore } = createBridge();
    const historyImages: IBloomHostHistoryImage[] = [
      {
        id: "edit-1",
        url: "https://host/history/edit-1.png",
        metadata: makeSidecar("edit-1", { isStarred: false }),
      },
    ];
    const persistence = createBloomHostPersistence(bridge, { historyImages });

    // URL-backed record (already on disk) with isStarred flipped on.
    await persistence.save(
      makeUiState({
        appState: {
          targetImageId: null,
          referenceImageIds: [],
          rightPanelImageId: null,
          history: [makeRecord("edit-1", "https://host/history/edit-1.png", { isStarred: true })],
        },
      }),
    );

    const sidecar = JSON.parse(fileStore.get("history/edit-1.json")!) as HistoryImageSidecar;
    expect(sidecar.isStarred).toBe(true);
    // URL-backed bytes are never re-written through the bridge.
    expect(fileStore.has("history/edit-1.png")).toBe(false);
  });

  it("deletes both png and sidecar when a history item is removed", async () => {
    const { bridge, fileStore } = createBridge();
    const historyImages: IBloomHostHistoryImage[] = [
      { id: "keep", url: "https://host/history/keep.png", metadata: makeSidecar("keep") },
      { id: "drop", url: "https://host/history/drop.png", metadata: makeSidecar("drop") },
    ];
    // Pre-seed the on-disk files so deletion is observable.
    fileStore.set("history/keep.png", "data:image/png;base64,keep");
    fileStore.set("history/keep.json", JSON.stringify(makeSidecar("keep")));
    fileStore.set("history/drop.png", "data:image/png;base64,drop");
    fileStore.set("history/drop.json", JSON.stringify(makeSidecar("drop")));
    const persistence = createBloomHostPersistence(bridge, { historyImages });

    await persistence.save(
      makeUiState({
        appState: {
          targetImageId: null,
          referenceImageIds: [],
          rightPanelImageId: null,
          history: [makeRecord("keep", "https://host/history/keep.png")],
        },
      }),
    );

    expect(fileStore.has("history/drop.png")).toBe(false);
    expect(fileStore.has("history/drop.json")).toBe(false);
    expect(fileStore.has("history/keep.json")).toBe(true);
  });

  it("persists apiKey to connection.json and loads it back", async () => {
    const { bridge, fileStore } = createBridge();
    const historyImages: IBloomHostHistoryImage[] = [
      { id: "edit-1", url: "https://host/history/edit-1.png", metadata: makeSidecar("edit-1") },
    ];
    const persistence = createBloomHostPersistence(bridge, { historyImages });

    await persistence.save(makeUiState({ auth: { apiKey: "sk-test-key", authMethod: "manual" } }));

    const connection = JSON.parse(fileStore.get("connection.json")!);
    expect(connection.apiKey).toBe("sk-test-key");

    const restored = await persistence.load();
    expect(restored?.auth.apiKey).toBe("sk-test-key");
  });

  it("connection.json apiKey takes precedence over state.json auth on load", async () => {
    const { bridge, fileStore } = createBridge();
    const historyImages: IBloomHostHistoryImage[] = [
      { id: "edit-1", url: "https://host/history/edit-1.png", metadata: makeSidecar("edit-1") },
    ];
    const persistence = createBloomHostPersistence(bridge, { historyImages });
    await persistence.save(makeUiState({ auth: { apiKey: "from-state", authMethod: "manual" } }));

    fileStore.set(
      "connection.json",
      JSON.stringify({ apiKey: "from-connection", authMethod: "manual" }),
    );

    const restored = await persistence.load();
    expect(restored?.auth.apiKey).toBe("from-connection");
  });

  it("clears state.json, connection.json, and history images + sidecars", async () => {
    const { bridge, fileStore } = createBridge();
    const historyImages: IBloomHostHistoryImage[] = [
      { id: "edit-1", url: "https://host/history/edit-1.png", metadata: makeSidecar("edit-1") },
    ];
    fileStore.set("history/edit-1.png", "data:image/png;base64,abc");
    fileStore.set("history/edit-1.json", JSON.stringify(makeSidecar("edit-1")));
    const persistence = createBloomHostPersistence(bridge, { historyImages });

    await persistence.save(makeUiState({ auth: { apiKey: "sk", authMethod: "manual" } }));
    expect(fileStore.has("state.json")).toBe(true);

    await persistence.clear();

    expect(fileStore.has("state.json")).toBe(false);
    expect(fileStore.has("connection.json")).toBe(false);
    expect(fileStore.has("history/edit-1.png")).toBe(false);
    expect(fileStore.has("history/edit-1.json")).toBe(false);
  });
});
