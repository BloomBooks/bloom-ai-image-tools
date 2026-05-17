import { describe, expect, it } from "vitest";
import { AppState, ImageRecord, PersistedAppState } from "../../types";
import { mergeHistoryFields, sanitizePersistedAppState } from "../persistedAppState";

const buildImageRecord = (overrides: Partial<ImageRecord>): ImageRecord => ({
  id: "img-1",
  parentId: null,
  imageData: "",
  imageFileName: null,
  toolId: "test",
  parameters: {},
  durationMs: 0,
  cost: 0,
  model: "model",
  timestamp: 1,
  promptUsed: "prompt",
  ...overrides,
});

describe("persistedAppState", () => {
  it("drops selections that only point to file-backed entries until folder access is available", () => {
    const fileBacked = buildImageRecord({
      id: "folder-only",
      imageFileName: "folder-only.png",
    });
    const persisted: PersistedAppState = {
      targetImageId: "folder-only",
      referenceImageIds: ["folder-only"],
      rightPanelImageId: "folder-only",
      history: [fileBacked],
    };

    const sanitized = sanitizePersistedAppState(persisted, {
      allowFileBackedEntries: false,
    });

    expect(sanitized.history).toEqual([fileBacked]);
    expect(sanitized.targetImageId).toBeNull();
    expect(sanitized.referenceImageIds).toEqual([]);
    expect(sanitized.rightPanelImageId).toBeNull();
  });

  it("preserves file-backed selections once folder access is available", () => {
    const fileBacked = buildImageRecord({
      id: "folder-only",
      imageFileName: "folder-only.png",
    });
    const persisted: PersistedAppState = {
      targetImageId: "folder-only",
      referenceImageIds: ["folder-only"],
      rightPanelImageId: "folder-only",
      history: [fileBacked],
    };

    const sanitized = sanitizePersistedAppState(persisted, {
      allowFileBackedEntries: true,
    });

    expect(sanitized.targetImageId).toBe("folder-only");
    expect(sanitized.referenceImageIds).toEqual(["folder-only"]);
    expect(sanitized.rightPanelImageId).toBe("folder-only");
  });

  it("keeps loaded image data when merging in manifest entries", () => {
    const currentRecord = buildImageRecord({
      id: "merged",
      imageData: "data:image/png;base64,current",
      imageFileName: "merged.png",
      isStarred: true,
    });
    const incomingRecord = buildImageRecord({
      id: "merged",
      imageData: "",
      imageFileName: "merged.png",
      isStarred: false,
    });
    const current: AppState = {
      targetImageId: "merged",
      referenceImageIds: [],
      rightPanelImageId: null,
      history: [currentRecord],
      isProcessing: false,
      isAuthenticated: false,
      error: null,
    };
    const incoming: PersistedAppState = {
      targetImageId: null,
      referenceImageIds: [],
      rightPanelImageId: null,
      history: [incomingRecord],
    };

    const merged = mergeHistoryFields(current, incoming);

    expect(merged.history).toHaveLength(1);
    expect(merged.history[0].imageData).toBe(currentRecord.imageData);
    expect(merged.history[0].isStarred).toBe(true);
    expect(merged.targetImageId).toBe("merged");
  });

  it("drops stale browser-cached history items when folder state is authoritative", () => {
    const staleCurrent = buildImageRecord({
      id: "stale",
      imageData: "data:image/png;base64,stale",
      imageFileName: null,
    });
    const folderRecord = buildImageRecord({
      id: "folder",
      imageData: "",
      imageFileName: "folder.png",
    });
    const current: AppState = {
      targetImageId: "stale",
      referenceImageIds: ["stale"],
      rightPanelImageId: "stale",
      history: [staleCurrent],
      isProcessing: false,
      isAuthenticated: false,
      error: null,
    };
    const incoming: PersistedAppState = {
      targetImageId: null,
      referenceImageIds: [],
      rightPanelImageId: null,
      history: [folderRecord],
    };

    const merged = mergeHistoryFields(current, incoming, {
      preserveCurrentOnlyHistory: false,
    });

    expect(merged.history.map((item) => item.id)).toEqual(["folder"]);
    expect(merged.targetImageId).toBeNull();
    expect(merged.referenceImageIds).toEqual([]);
    expect(merged.rightPanelImageId).toBeNull();
  });
});
