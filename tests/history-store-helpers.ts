import { Page } from "@playwright/test";

/**
 * Install a richer in-page mock for the File System Access API than the one
 * in playwright_helpers.ts. This mock:
 *   - supports nested directories (images/, tombstones/)
 *   - serializes state to localStorage so it survives reload
 *   - exposes __mockFsRoot for assertions
 *   - lets tests rewrite the underlying state directly (multi-machine sims)
 */
export const installMockFsForHistoryStore = async (page: Page) => {
  await page.addInitScript(() => {
    const STORAGE_KEY = "__mockFsState_v2";
    const ROOT_NAME = "mock-history";

    type DirState = {
      files: Record<string, { type: string; lastModified: number; dataB64: string }>;
      dirs: Record<string, DirState>;
    };

    type State = { root: { name: string } & DirState };

    const makeEmptyDir = (): DirState => ({ files: {}, dirs: {} });

    const ensureState = (): State => {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        try {
          return JSON.parse(raw) as State;
        } catch {
          /* fallthrough */
        }
      }
      const next: State = { root: { name: ROOT_NAME, ...makeEmptyDir() } };
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    };

    let state = ensureState();

    const persist = () => {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    };

    const notFound = () => {
      throw new DOMException("Not found", "NotFoundError");
    };

    const blobToB64 = (blob: Blob): Promise<string> =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const result = r.result as string;
          const idx = result.indexOf(",");
          resolve(idx === -1 ? result : result.slice(idx + 1));
        };
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });

    const b64ToArrayBuf = (b64: string): ArrayBuffer => {
      const binary = atob(b64);
      const buf = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) buf[i] = binary.charCodeAt(i);
      return buf.buffer;
    };

    const toBlob = async (data: unknown): Promise<Blob> => {
      if (data instanceof Blob) return data;
      if (data instanceof ArrayBuffer) return new Blob([data]);
      if (ArrayBuffer.isView(data)) return new Blob([data.buffer as ArrayBuffer]);
      if (typeof data === "string") return new Blob([data]);
      return new Blob([String(data)]);
    };

    const createFileHandle = (dir: DirState, name: string) => ({
      kind: "file" as const,
      name,
      getFile: async () => {
        const record = dir.files[name];
        if (!record) notFound();
        const buf = b64ToArrayBuf(record.dataB64);
        return new File([buf], name, {
          type: record.type || "",
          lastModified: record.lastModified || Date.now(),
        });
      },
      createWritable: async () => ({
        write: async (data: unknown) => {
          const blob = await toBlob(data);
          const b64 = await blobToB64(blob);
          dir.files[name] = {
            type: blob.type || "",
            lastModified: Date.now(),
            dataB64: b64,
          };
          persist();
        },
        close: async () => undefined,
      }),
    });

    const createDirHandle = (dir: DirState, name: string): unknown => ({
      kind: "directory" as const,
      name,
      queryPermission: async () => "granted",
      requestPermission: async () => "granted",
      getDirectoryHandle: async (childName: string, options?: { create?: boolean }) => {
        const existing = dir.dirs[childName];
        if (existing) return createDirHandle(existing, childName);
        if (!options?.create) notFound();
        dir.dirs[childName] = makeEmptyDir();
        persist();
        return createDirHandle(dir.dirs[childName], childName);
      },
      getFileHandle: async (fileName: string, options?: { create?: boolean }) => {
        if (!dir.files[fileName]) {
          if (!options?.create) notFound();
          dir.files[fileName] = {
            type: "",
            lastModified: Date.now(),
            dataB64: "",
          };
          persist();
        }
        return createFileHandle(dir, fileName);
      },
      removeEntry: async (childName: string, options?: { recursive?: boolean }) => {
        if (dir.files[childName]) {
          delete dir.files[childName];
          persist();
          return;
        }
        if (dir.dirs[childName]) {
          if (!options?.recursive && Object.keys(dir.dirs[childName].files).length > 0) {
            throw new DOMException("Directory not empty", "InvalidModificationError");
          }
          delete dir.dirs[childName];
          persist();
          return;
        }
        notFound();
      },
      entries: async function* () {
        for (const fileName of Object.keys(dir.files)) {
          yield [fileName, createFileHandle(dir, fileName)] as const;
        }
        for (const dirName of Object.keys(dir.dirs)) {
          yield [dirName, createDirHandle(dir.dirs[dirName], dirName)] as const;
        }
      },
    });

    const rootHandle = createDirHandle(state.root, state.root.name);

    (window as unknown as Record<string, unknown>).showDirectoryPicker = async () => rootHandle;

    // Snapshot the in-memory state, not localStorage. The closures that
    // back the directory handles reference `state` directly, and localStorage
    // can be cleared between navigations by the reset helper without us
    // wanting to lose the live state.
    (window as unknown as Record<string, unknown>).__mockFsRead = () =>
      JSON.parse(JSON.stringify(state));

    // Mutate the existing state.root in place so that directory handles
    // (which closed over state.root) still see the updates.
    (window as unknown as Record<string, unknown>).__mockFsWrite = (next: State) => {
      state.root.files = next.root.files ?? {};
      state.root.dirs = next.root.dirs ?? {};
      if (next.root.name) state.root.name = next.root.name;
      persist();
    };
  });
};

/**
 * Wipe IndexedDB so each test starts fresh. Idempotent across navigations —
 * only the first page load in a test session actually resets; subsequent
 * navigations (test reloads) leave the state intact.
 */
export const resetAllStorage = async (page: Page) => {
  await page.addInitScript(() => {
    const marker = "__historyResetDone";
    if (window.sessionStorage?.getItem(marker) === "1") {
      (window as unknown as Record<string, unknown>).__resetReady = Promise.resolve();
      return;
    }
    window.sessionStorage?.setItem(marker, "1");

    (window as unknown as Record<string, unknown>).__resetReady = (async () => {
      const dbs = ["bloom-image-tools-state", "bloom-image-tools-fs", "bloom-image-tools-history"];
      await Promise.all(
        dbs.map(
          (name) =>
            new Promise<void>((resolve) => {
              try {
                const req = indexedDB.deleteDatabase(name);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              } catch {
                resolve();
              }
            }),
        ),
      );
      window.localStorage?.removeItem("__mockFsState_v2");
    })();
  });
};

/** Await reset completion after the page is open. */
export const awaitResetReady = async (page: Page) => {
  await page.evaluate(() => (window as unknown as { __resetReady?: Promise<void> }).__resetReady);
};
