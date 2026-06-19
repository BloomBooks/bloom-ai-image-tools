/**
 * IBloomHostBridge — the seam between this editor and whatever "host" is embedding it.
 * =================================================================================
 *
 * WHAT THIS FILE IS
 *   The editor (the exported `ImageToolsWorkspace`) never talks to Bloom directly.
 *   Everything host-specific — receiving the launch payload, reading/writing files,
 *   committing chosen images back to the book, opening an external browser for OAuth —
 *   goes through the `IBloomHostBridge` interface defined here. `BloomHostedImageEditor`
 *   consumes a bridge; it does not care which concrete bridge it got.
 *
 * THE ONE TRANSPORT WE ACTUALLY SHIP: an iframe + window.postMessage.
 *   Bloom hosts the editor as an <iframe> overlay inside its existing edit-tab
 *   WebView2 (see Bloom's AiImageEditorApi.cs + CanvasElementContextControls.tsx).
 *   The editor runs in that iframe and reaches its host via `window.parent.postMessage`
 *   on the channel "bloom-ai-image-tools". That is `createIframeBloomHostBridge()`.
 *
 *   Bytes never travel over postMessage. Control messages (init / ready / commit /
 *   cancel / log / open-external / saveCredentials / ack) go over the channel; image and JSON file
 *   contents move over plain HTTP to Bloom's local server via getFile/putFile/
 *   deleteFile, using `httpBase` + `sessionToken` from the init payload. This keeps
 *   large images off the message bus and lets the host fetch result bytes from the
 *   per-book `.ai-image-editor/` folder at commit time.
 *
 * THE FAKE TRANSPORT FOR DEV/TESTS: `createHarnessBloomHostBridge()`.
 *   Backs the same interface with in-memory state and an immediate init, so the editor
 *   can run standalone (see App.tsx `?mode=bloom-harness` and BloomHostHarness.tsx)
 *   and so e2e tests can exercise the host flows with no real Bloom present.
 *
 * HISTORY NOTE: an earlier design ran the editor in a *dedicated* WebView2 window and
 *   used `chrome.webview.postMessage`. That path (a `createWebViewBloomHostBridge`)
 *   has been removed — Bloom always launches us as an iframe with `?mode=bloom-iframe`.
 *   If a future host embeds us some other way, add a new factory here; nothing outside
 *   this file should learn the transport.
 */
import { HistoryImageSidecar } from "../../types";

export interface IBloomHostBookImage {
  id: string;
  src: string;
  pageLabel?: string;
  width?: number;
  height?: number;
  /** True when the slot is an empty placeholder; the editor shows its own
   *  placeholder graphic instead of trying to load the book's placeHolder.png. */
  isPlaceholder?: boolean;
}

export interface IBloomHostReferenceImage {
  id: string;
  src: string;
  name?: string;
}

/**
 * One image enumerated from the per-book `.ai-image-editor/history/` folder.
 * The host scans the folder and supplies, for each image file, its id, a
 * host-served URL for the bytes, and the parsed contents of the sibling
 * `history/<id>.json` sidecar (or null/omitted for an image that has no
 * sidecar yet — e.g. one dropped in by hand). The folder is the source of
 * truth, so any file present here appears in the editor's history.
 */
export interface IBloomHostHistoryImage {
  /** Filename stem, matching `history/<id>.png` and `history/<id>.json`. */
  id: string;
  /** Host-served URL for the image bytes (referenced directly; never inlined). */
  url: string;
  /** Parsed `history/<id>.json`; null/omitted when no sidecar exists. */
  metadata?: HistoryImageSidecar | null;
}

export interface IBloomHostInitPayload {
  book: { id: string; title: string };
  bookImages: IBloomHostBookImage[];
  /** The book image the user launched the editor on (bookImages[].id), to be
   *  pre-loaded into the "Image to Edit" slot. */
  selectedBookImageId?: string;
  historyFolderUrl?: string;
  referenceFolderUrl?: string;
  /** History enumerated by the host from `.ai-image-editor/history/`. The folder
   *  is the source of truth; the editor builds its history from this list rather
   *  than from `state.json`. */
  history?: IBloomHostHistoryImage[];
  references: IBloomHostReferenceImage[];
  apiKey?: string | null;
  openRouterUser?: string | null;
  /** Root of Bloom's local AI-image-editor HTTP API, e.g.
   *  `http://localhost:8089/bloom/api/aiImageEditor`. The port is whatever Bloom's
   *  server actually bound (8089 is only its default), so this is always supplied by
   *  the host at runtime and never hard-coded outside the dev harness. */
  httpBase: string;
  sessionToken: string;
}

export interface IBloomCommitReplacement {
  /** The book image slot being replaced (the host-supplied bookImages[].id). */
  incomingId: string;
  /** For a generated/uploaded result: the editor result id. The host reads its
   *  bytes from `.ai-image-editor/history/<resultId>.png` (written via the file
   *  endpoint before commit), so large image bytes never cross the bridge. */
  resultId?: string;
  /** For an image that already has a host-served URL (e.g. another book image
   *  reused as a replacement): that URL, which the host resolves to a file. */
  sourceUrl?: string;
}

// The host integration has TWO distinct planes, so the bridge is split into two
// interfaces that happen to be implemented together:
//
//   IBloomHostControl — the lifecycle/control channel. In the real bridge these ride
//     window.postMessage to Bloom's front-end (CanvasElementContextControls.tsx),
//     because each one has a front-end side effect the editor iframe can't do itself:
//     init is built and sent by the front-end, commit must apply current-page edits to
//     the LIVE page DOM via Bloom's changeImage(), and cancel/close own the overlay.
//
//   IBloomHostFiles — a plain file store under the book's .ai-image-editor/ folder. In
//     the real bridge these go straight to Bloom's C# server (AiImageEditorApi) over
//     HTTP, NOT through postMessage, so image BYTES never ride the message bus.
//
// `IBloomHostBridge` is just "implements both". Consumers should depend on the narrowest
// piece they need — e.g. bloomHostPersistence only needs IBloomHostFiles. The harness
// fakes both planes in-memory, which is why the split is invisible there.

/** Lifecycle/control channel (postMessage-backed in the iframe bridge). */
export interface IBloomHostControl {
  ready: () => void;
  onInit: (callback: (payload: IBloomHostInitPayload) => void) => () => void;
  onRequestClose: (callback: () => void) => () => void;
  commit: (replacements: IBloomCommitReplacement[]) => Promise<void>;
  cancel: () => void;
  log: (level: "info" | "warn" | "error", message: string) => void;
  /** Ask the host to open a URL in the user's default browser (not the WebView).
   *  Used for OpenRouter OAuth so login happens with the user's normal browser
   *  identity; the resulting code is retrieved out-of-band via the localhost
   *  callback + `pollOAuthCodeFromBloomHost`. */
  openExternalUrl: (url: string) => void;
  /** Hand newly obtained OpenRouter credentials up to the host to persist. Bloom owns
   *  the key: it stores it per-user and re-supplies it in `init.apiKey` on each launch,
   *  so the editor must NOT persist it itself (it would otherwise travel with the book).
   *  A null apiKey clears the host's stored credentials (sign-out). */
  saveCredentials: (creds: {
    apiKey: string | null;
    authMethod: "oauth" | "manual" | null;
    openRouterUser?: string | null;
  }) => void;
}

/** File store for the book's .ai-image-editor/ folder (HTTP-backed in the iframe
 *  bridge; bytes go straight to C#, never over postMessage). */
export interface IBloomHostFiles {
  /** Get a file from the .ai-image-editor folder. Returns null on 404.
   *  PNG files are returned as base64 data URLs; JSON files as text. */
  getFile: (name: string) => Promise<string | null>;
  /** Write a file to the .ai-image-editor folder.
   *  PNG files should be passed as base64 data URLs; JSON files as text. */
  putFile: (name: string, data: string) => Promise<void>;
  /** Delete a file from the .ai-image-editor folder. */
  deleteFile: (name: string) => Promise<void>;
  /** Clear all files in the .ai-image-editor folder (used by the harness reset). */
  clearAllFiles: () => Promise<void>;
}

/** A full bridge implements both planes. */
export type IBloomHostBridge = IBloomHostControl & IBloomHostFiles;

/** Messages the host sends down to the editor (init + lifecycle + request acks). */
type HostToEditorMessage =
  | { type: "init"; payload: IBloomHostInitPayload }
  | { type: "request-close" }
  | { type: "ack"; requestId: string; ok: boolean; error?: string };

/** Every message on the "bloom-ai-image-tools" channel: the host-to-editor set above
 *  (wrapped with the channel tag) plus the editor-to-host messages. */
type IframeMessage =
  | ({ channel: "bloom-ai-image-tools" } & HostToEditorMessage)
  | {
      channel: "bloom-ai-image-tools";
      type: "ready";
      payload: {};
    }
  | {
      channel: "bloom-ai-image-tools";
      type: "commit";
      requestId: string;
      payload: { replacements: IBloomCommitReplacement[] };
    }
  | {
      channel: "bloom-ai-image-tools";
      type: "cancel";
      payload: {};
    }
  | {
      channel: "bloom-ai-image-tools";
      type: "log";
      payload: { level: "info" | "warn" | "error"; message: string };
    }
  | {
      channel: "bloom-ai-image-tools";
      type: "open-external";
      payload: { url: string };
    }
  | {
      channel: "bloom-ai-image-tools";
      type: "saveCredentials";
      payload: {
        apiKey: string | null;
        authMethod: "oauth" | "manual" | null;
        openRouterUser?: string | null;
      };
    };

const uuid = () => Math.random().toString(36).slice(2, 10);
const iframeChannel = "bloom-ai-image-tools" as const;

// Lightweight diagnostics: Bloom (StrictMode, re-launches) can send `init` more than
// once, so we count them and log when the payload actually changed. Exposed on
// `window.__bloomAiInitDebugState` purely for manual debugging.
type InitDebugState = {
  total: number;
  last: { sessionToken: string; bookId: string; imageCount: number } | null;
};

const getInitDebugState = (): InitDebugState | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const globalWindow = window as Window & { __bloomAiInitDebugState?: InitDebugState };
  if (!globalWindow.__bloomAiInitDebugState) {
    globalWindow.__bloomAiInitDebugState = { total: 0, last: null };
  }

  return globalWindow.__bloomAiInitDebugState;
};

const recordInitMessage = (payload: IBloomHostInitPayload) => {
  const debugState = getInitDebugState();
  if (!debugState) {
    return;
  }

  debugState.total += 1;

  const next = {
    sessionToken: payload.sessionToken,
    bookId: payload.book.id,
    imageCount: payload.bookImages.length,
  };
  const previous = debugState.last;
  const changedSincePrevious =
    !previous ||
    previous.sessionToken !== next.sessionToken ||
    previous.bookId !== next.bookId ||
    previous.imageCount !== next.imageCount;
  debugState.last = next;

  console.info("[IBloomHostBridge] init received", {
    totalCount: debugState.total,
    changedSincePrevious,
    sessionToken: payload.sessionToken,
    bookId: payload.book.id,
    bookTitle: payload.book.title,
    bookImageCount: payload.bookImages.length,
  });
};

const dataUrlToBytes = (dataUrl: string): Uint8Array<ArrayBuffer> => {
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const bytesToDataUrl = (bytes: ArrayBuffer, mimeType = "image/png"): string => {
  const uint8 = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
};

/**
 * The real, shipping bridge. The editor is an <iframe> inside Bloom's WebView2 and
 * talks to its parent (Bloom's edit-tab UI) over window.postMessage on the
 * "bloom-ai-image-tools" channel. File I/O is plain HTTP against `httpBase`, gated by
 * the per-launch `sessionToken`; both arrive in the `init` message. Selected by
 * App.tsx when the URL carries `?mode=bloom-iframe`.
 */
export const createIframeBloomHostBridge = (): IBloomHostBridge => {
  const initListeners = new Set<(payload: IBloomHostInitPayload) => void>();
  const requestCloseListeners = new Set<() => void>();
  const pendingRequests = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();

  let httpBase = "";
  let sessionToken = "";

  // Session token is passed as a query param (not a custom header) so the file
  // requests stay "simple" and avoid a CORS preflight against Bloom's server in dev.
  const fileUrl = (name: string) =>
    `${httpBase}/file?name=${encodeURIComponent(name)}&session=${encodeURIComponent(sessionToken)}`;

  const targetOrigin = (() => {
    if (typeof document === "undefined" || !document.referrer) {
      return "*";
    }

    try {
      return new URL(document.referrer).origin;
    } catch {
      return "*";
    }
  })();

  const postToParent = (message: IframeMessage) => {
    if (typeof window === "undefined" || window.parent === window) {
      return;
    }

    window.parent.postMessage(message, targetOrigin);
  };

  const handleMessage = (event: MessageEvent<IframeMessage>) => {
    const message = event.data;
    if (!message || message.channel !== iframeChannel) {
      return;
    }

    if (message.type === "init") {
      recordInitMessage(message.payload);
      httpBase = message.payload.httpBase ?? "";
      sessionToken = message.payload.sessionToken ?? "";
      initListeners.forEach((listener) => listener(message.payload));
      return;
    }

    if (message.type === "request-close") {
      requestCloseListeners.forEach((listener) => listener());
      return;
    }

    if (message.type === "ack") {
      const pending = pendingRequests.get(message.requestId);
      if (!pending) {
        return;
      }

      pendingRequests.delete(message.requestId);
      if (message.ok) {
        pending.resolve();
      } else {
        pending.reject(new Error(message.error || "Bloom host request failed."));
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("message", handleMessage as EventListener);
  }

  return {
    ready() {
      postToParent({ channel: iframeChannel, type: "ready", payload: {} });
    },
    onInit(callback) {
      initListeners.add(callback);
      return () => {
        initListeners.delete(callback);
      };
    },
    onRequestClose(callback) {
      requestCloseListeners.add(callback);
      return () => {
        requestCloseListeners.delete(callback);
      };
    },
    async commit(replacements) {
      const requestId = uuid();
      const promise = new Promise<void>((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });
      });
      postToParent({
        channel: iframeChannel,
        type: "commit",
        requestId,
        payload: { replacements },
      });
      await promise;
    },
    cancel() {
      postToParent({ channel: iframeChannel, type: "cancel", payload: {} });
    },
    log(level, message) {
      postToParent({ channel: iframeChannel, type: "log", payload: { level, message } });
    },
    openExternalUrl(url) {
      postToParent({ channel: iframeChannel, type: "open-external", payload: { url } });
    },
    saveCredentials(creds) {
      postToParent({
        channel: iframeChannel,
        type: "saveCredentials",
        payload: {
          apiKey: creds.apiKey,
          authMethod: creds.authMethod,
          openRouterUser: creds.openRouterUser ?? null,
        },
      });
    },
    async getFile(name) {
      if (!httpBase || !sessionToken) {
        throw new Error("Bloom host bridge is not initialized.");
      }
      const response = await fetch(fileUrl(name));
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to read host file ${name}: ${response.status}`);
      }
      if (name.endsWith(".png")) {
        const buffer = await response.arrayBuffer();
        return bytesToDataUrl(buffer);
      }
      return response.text();
    },
    async putFile(name, data) {
      if (!httpBase || !sessionToken) {
        throw new Error("Bloom host bridge is not initialized.");
      }
      const headers: Record<string, string> = {};
      let body: string | Uint8Array<ArrayBuffer>;
      if (name.endsWith(".png")) {
        body = dataUrlToBytes(data);
      } else {
        headers["Content-Type"] = "application/json";
        body = data;
      }
      const response = await fetch(fileUrl(name), { method: "POST", body, headers });
      if (!response.ok) {
        throw new Error(`Failed to write host file ${name}: ${response.status}`);
      }
    },
    async deleteFile(name) {
      if (!httpBase || !sessionToken) {
        throw new Error("Bloom host bridge is not initialized.");
      }
      const response = await fetch(fileUrl(name), { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete host file ${name}: ${response.status}`);
      }
    },
    async clearAllFiles() {
      // Best-effort: delete the well-known top-level files; history PNGs
      // are cleaned up by bloomHostPersistence.clear() in normal operation.
      await Promise.allSettled([this.deleteFile("state.json"), this.deleteFile("connection.json")]);
    },
  };
};

type HarnessOptions = {
  initPayload: IBloomHostInitPayload;
  onCommit?: (replacements: IBloomCommitReplacement[]) => void;
  onCancel?: () => void;
  onReady?: () => void;
  initialFiles?: Record<string, string>;
};

/**
 * A fake host bridge for standalone dev and e2e tests. There is no real Bloom: files
 * live in an in-memory Map, `ready()` replays the supplied init synchronously, and
 * `openExternalUrl` just opens a browser tab. Used by BloomHostHarness.tsx
 * (App.tsx `?mode=bloom-harness`).
 */
export const createHarnessBloomHostBridge = (options: HarnessOptions): IBloomHostBridge => {
  const initListeners = new Set<(payload: IBloomHostInitPayload) => void>();
  const requestCloseListeners = new Set<() => void>();
  const fileStore = new Map<string, string>(Object.entries(options.initialFiles ?? {}));

  return {
    ready() {
      options.onReady?.();
      queueMicrotask(() => {
        initListeners.forEach((listener) => listener(options.initPayload));
      });
    },
    onInit(callback) {
      initListeners.add(callback);
      return () => {
        initListeners.delete(callback);
      };
    },
    onRequestClose(callback) {
      requestCloseListeners.add(callback);
      return () => {
        requestCloseListeners.delete(callback);
      };
    },
    async commit(replacements) {
      options.onCommit?.(replacements);
    },
    cancel() {
      options.onCancel?.();
    },
    log(level, message) {
      console[level](`[BloomHarness] ${message}`);
    },
    openExternalUrl(url) {
      if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    },
    saveCredentials() {
      // No real host to persist to in standalone/harness mode; the editor keeps the
      // key in its own state (and localStorage) as usual.
    },
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
};
