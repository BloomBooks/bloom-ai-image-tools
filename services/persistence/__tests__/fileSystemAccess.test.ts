import { describe, expect, it } from "vite-plus/test";
import { ImageRecord } from "../../../types";
import {
  readFolderPersistedState,
  readImageFile,
  writeHistoryImageRecord,
  writeImageFile,
} from "../fileSystemAccess";

type MockDirState = {
  files: Record<string, { type: string; lastModified: number; dataB64: string }>;
  dirs: Record<string, MockDirState>;
};

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

const installMockImage = (width: number, height: number) => {
  const originalImage = globalThis.Image;

  class MockImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: null | (() => void) = null;
    onerror: null | (() => void) = null;

    set src(_value: string) {
      queueMicrotask(() => {
        this.onload?.();
      });
    }
  }

  globalThis.Image = MockImage as unknown as typeof Image;

  return () => {
    globalThis.Image = originalImage;
  };
};

const encodeText = (text: string) => Buffer.from(text, "utf8").toString("base64");

const decodeBase64 = (dataB64: string) => Uint8Array.from(Buffer.from(dataB64, "base64"));

const makeDir = (): MockDirState => ({ files: {}, dirs: {} });

const createMockDirectoryHandle = (dir: MockDirState, name = "mock-history") => ({
  kind: "directory" as const,
  name,
  queryPermission: async () => "granted",
  requestPermission: async () => "granted",
  getDirectoryHandle: async (childName: string, options?: { create?: boolean }) => {
    const existing = dir.dirs[childName];
    if (existing) return createMockDirectoryHandle(existing, childName);
    if (!options?.create) throw new DOMException("Not found", "NotFoundError");
    dir.dirs[childName] = makeDir();
    return createMockDirectoryHandle(dir.dirs[childName], childName);
  },
  getFileHandle: async (fileName: string, options?: { create?: boolean }) => {
    if (!dir.files[fileName]) {
      if (!options?.create) throw new DOMException("Not found", "NotFoundError");
      dir.files[fileName] = {
        type: "",
        lastModified: Date.now(),
        dataB64: "",
      };
    }
    return {
      kind: "file" as const,
      name: fileName,
      getFile: async () => {
        const record = dir.files[fileName];
        if (!record) throw new DOMException("Not found", "NotFoundError");
        return new File([decodeBase64(record.dataB64)], fileName, {
          type: record.type,
          lastModified: record.lastModified,
        });
      },
      createWritable: async () => ({
        write: async (blob: Blob) => {
          const buffer = await blob.arrayBuffer();
          dir.files[fileName] = {
            type: blob.type || "",
            lastModified: Date.now(),
            dataB64: Buffer.from(buffer).toString("base64"),
          };
        },
        close: async () => undefined,
      }),
    };
  },
  removeEntry: async (childName: string) => {
    if (dir.files[childName]) {
      delete dir.files[childName];
      return;
    }
    if (dir.dirs[childName]) {
      delete dir.dirs[childName];
      return;
    }
    throw new DOMException("Not found", "NotFoundError");
  },
  entries: async function* () {
    for (const fileName of Object.keys(dir.files)) {
      yield [fileName, await this.getFileHandle(fileName)] as const;
    }
    for (const dirName of Object.keys(dir.dirs)) {
      yield [dirName, await this.getDirectoryHandle(dirName)] as const;
    }
  },
});

type MockFileRecord = {
  writes: Blob[];
  createWritableCalls: number;
};

const buildImageRecord = (overrides: Partial<ImageRecord> = {}): ImageRecord => ({
  id: "img-1",
  parentId: null,
  imageData: SAMPLE_PNG_DATA_URL,
  imageFileName: null,
  toolId: "test",
  parameters: {},
  sourceStyleId: null,
  durationMs: 0,
  cost: 0,
  model: "model",
  reasoningLevel: null,
  timestamp: 1,
  promptUsed: "prompt",
  sourceSummary: null,
  resolution: undefined,
  isStarred: false,
  origin: "uploaded",
  ...overrides,
});

describe("writeImageFile", () => {
  it("retries once when createWritable first fails with InvalidStateError", async () => {
    const files = new Map<string, MockFileRecord>();
    let createWritableAttempts = 0;

    const directoryHandle = {
      getDirectoryHandle: async (_name: string, _options?: { create?: boolean }) => ({
        getFileHandle: async (fileName: string, _fileOptions?: { create?: boolean }) => ({
          createWritable: async () => {
            createWritableAttempts += 1;
            if (createWritableAttempts === 1) {
              throw new DOMException("busy", "InvalidStateError");
            }

            return {
              write: async (blob: Blob) => {
                const record = files.get(fileName) ?? { writes: [], createWritableCalls: 0 };
                record.writes.push(blob);
                record.createWritableCalls += 1;
                files.set(fileName, record);
              },
              close: async () => undefined,
            };
          },
        }),
      }),
    } as unknown as FileSystemDirectoryHandle;

    await writeImageFile(
      {
        directoryHandle,
        directoryName: "dropbox-history",
      },
      "example.png",
      SAMPLE_PNG_DATA_URL,
    );

    expect(createWritableAttempts).toBe(2);
    expect(files.get("example.png")?.writes).toHaveLength(1);
  });

  it("writes image bytes and a sidecar for folder-backed history records", async () => {
    const root = makeDir();
    const binding = {
      directoryHandle: createMockDirectoryHandle(root) as unknown as FileSystemDirectoryHandle,
      directoryName: "dropbox-history",
    };

    const saved = await writeHistoryImageRecord(binding, buildImageRecord({ id: "saved" }));

    expect(saved.imageFileName).toBe("saved.png");
    expect(root.dirs.images.files["saved.png"]).toBeDefined();
    expect(root.dirs.images.files["saved.json"]).toBeDefined();

    const sidecar = JSON.parse(
      Buffer.from(root.dirs.images.files["saved.json"].dataB64, "base64").toString("utf8"),
    );

    expect(sidecar.id).toBe("saved");
    expect(sidecar.imageMime).toBe("image/png");
    expect(sidecar.promptUsed).toBe("prompt");
  });

  it("returns null for zero-byte image files", async () => {
    const root = makeDir();
    root.dirs.images = makeDir();
    root.dirs.images.files["empty.png"] = {
      type: "image/png",
      lastModified: Date.now(),
      dataB64: "",
    };

    const binding = {
      directoryHandle: createMockDirectoryHandle(root) as unknown as FileSystemDirectoryHandle,
      directoryName: "dropbox-history",
    };

    await expect(readImageFile(binding, "empty.png")).resolves.toBeNull();
  });

  it("drops and cleans orphaned sidecars when image bytes are missing or empty", async () => {
    const root = makeDir();
    root.dirs.images = makeDir();

    const thumbnailStrips = {
      activeStripId: "history",
      pinnedStripIds: [],
      itemIdsByStrip: {
        history: ["good", "zero", "missing"],
        starred: [],
        reference: [],
        environment: [],
      },
    };

    root.files["app-state.json"] = {
      type: "application/json",
      lastModified: Date.now(),
      dataB64: encodeText(
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          targetImageId: null,
          referenceImageIds: [],
          rightPanelImageId: null,
          thumbnailStrips,
        }),
      ),
    };

    root.dirs.images.files["good.png"] = {
      type: "image/png",
      lastModified: Date.now(),
      dataB64: SAMPLE_PNG_DATA_URL.split(",")[1],
    };
    root.dirs.images.files["good.json"] = {
      type: "application/json",
      lastModified: Date.now(),
      dataB64: encodeText(
        JSON.stringify({
          id: "good",
          parentId: null,
          toolId: "test",
          parameters: {},
          promptUsed: "good",
          model: "model",
          reasoningLevel: null,
          timestamp: 1,
          durationMs: 0,
          cost: 0,
          origin: "uploaded",
          isStarred: false,
          sourceStyleId: null,
          sourceSummary: null,
          imageMime: "image/png",
          metaUpdatedAt: 1,
        }),
      ),
    };
    root.dirs.images.files["zero.png"] = {
      type: "image/png",
      lastModified: Date.now(),
      dataB64: "",
    };
    root.dirs.images.files["zero.json"] = {
      type: "application/json",
      lastModified: Date.now(),
      dataB64: encodeText(
        JSON.stringify({
          id: "zero",
          parentId: null,
          toolId: "test",
          parameters: {},
          promptUsed: "zero",
          model: "model",
          reasoningLevel: null,
          timestamp: 1,
          durationMs: 0,
          cost: 0,
          origin: "uploaded",
          isStarred: false,
          sourceStyleId: null,
          sourceSummary: null,
          imageMime: "image/png",
          metaUpdatedAt: 1,
        }),
      ),
    };
    root.dirs.images.files["missing.json"] = {
      type: "application/json",
      lastModified: Date.now(),
      dataB64: encodeText(
        JSON.stringify({
          id: "missing",
          parentId: null,
          toolId: "test",
          parameters: {},
          promptUsed: "missing",
          model: "model",
          reasoningLevel: null,
          timestamp: 1,
          durationMs: 0,
          cost: 0,
          origin: "uploaded",
          isStarred: false,
          sourceStyleId: null,
          sourceSummary: null,
          imageMime: "image/png",
          metaUpdatedAt: 1,
        }),
      ),
    };

    const binding = {
      directoryHandle: createMockDirectoryHandle(root) as unknown as FileSystemDirectoryHandle,
      directoryName: "dropbox-history",
    };

    const persisted = await readFolderPersistedState(binding);

    expect(persisted?.appState.history.map((item) => item.id)).toEqual(["good"]);
    expect(root.dirs.images.files["good.json"]).toBeDefined();
    expect(root.dirs.images.files["zero.json"]).toBeUndefined();
    expect(root.dirs.images.files["missing.json"]).toBeUndefined();
    expect(root.dirs.images.files["zero.png"]).toBeUndefined();
  });

  it("recovers orphan image files even when app-state.json exists", async () => {
    const restoreImage = installMockImage(640, 480);
    const root = makeDir();
    root.dirs.images = makeDir();

    root.files["app-state.json"] = {
      type: "application/json",
      lastModified: Date.now(),
      dataB64: encodeText(
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          targetImageId: null,
          referenceImageIds: [],
          rightPanelImageId: null,
          thumbnailStrips: {
            activeStripId: "history",
            pinnedStripIds: [],
            itemIdsByStrip: {
              history: [],
              starred: [],
              reference: [],
              environment: [],
            },
          },
        }),
      ),
    };

    root.dirs.images.files["orphan.png"] = {
      type: "image/png",
      lastModified: 1234,
      dataB64: SAMPLE_PNG_DATA_URL.split(",")[1],
    };

    const binding = {
      directoryHandle: createMockDirectoryHandle(root) as unknown as FileSystemDirectoryHandle,
      directoryName: "dropbox-history",
    };

    const persisted = await readFolderPersistedState(binding);
    restoreImage();

    expect(persisted?.appState.history.map((item) => item.id)).toEqual(["orphan"]);
    expect(persisted?.appState.history[0].imageFileName).toBe("orphan.png");
    expect(persisted?.appState.history[0].promptUsed).toBe("Recovered image");
    expect(persisted?.appState.history[0].resolution).toEqual({ width: 640, height: 480 });
  });

  it("restores recovered images into saved starred, character, and reference groupings", async () => {
    const root = makeDir();
    root.dirs.images = makeDir();

    root.files["app-state.json"] = {
      type: "application/json",
      lastModified: Date.now(),
      dataB64: encodeText(
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          targetImageId: null,
          referenceImageIds: ["book-page"],
          rightPanelImageId: null,
          thumbnailStrips: {
            activeStripId: "history",
            pinnedStripIds: [],
            itemIdsByStrip: {
              history: ["hero-cast", "starred-shot", "book-page"],
              characters: ["hero-cast"],
              starred: ["starred-shot"],
              reference: [],
              environment: [],
            },
          },
        }),
      ),
    };

    for (const fileName of ["hero-cast.png", "starred-shot.png", "book-page.png"]) {
      root.dirs.images.files[fileName] = {
        type: "image/png",
        lastModified: 1234,
        dataB64: SAMPLE_PNG_DATA_URL.split(",")[1],
      };
    }

    const binding = {
      directoryHandle: createMockDirectoryHandle(root) as unknown as FileSystemDirectoryHandle,
      directoryName: "dropbox-history",
    };

    const persisted = await readFolderPersistedState(binding);

    const byId = new Map(persisted?.appState.history.map((item) => [item.id, item]) ?? []);

    expect(byId.get("hero-cast")?.toolId).toBe("extract_cast_of_characters");
    expect(byId.get("starred-shot")?.isStarred).toBe(true);
    expect(persisted?.thumbnailStrips?.itemIdsByStrip.characters).toEqual(["hero-cast"]);
    expect(persisted?.thumbnailStrips?.itemIdsByStrip.starred).toEqual(["starred-shot"]);
    expect(persisted?.thumbnailStrips?.itemIdsByStrip.reference).toEqual(["book-page"]);
  });
});
