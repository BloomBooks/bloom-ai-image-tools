export interface BloomHostBookImage {
  id: string;
  src: string;
  pageLabel?: string;
  width?: number;
  height?: number;
}

export interface BloomHostReferenceImage {
  id: string;
  src: string;
  name?: string;
}

export interface BloomHostInitPayload {
  book: { id: string; title: string };
  bookImages: BloomHostBookImage[];
  historyFolderUrl?: string;
  referenceFolderUrl?: string;
  references: BloomHostReferenceImage[];
  apiKey?: string | null;
  openRouterUser?: string | null;
  httpBase: string;
  sessionToken: string;
}

export interface BloomCommitReplacement {
  incomingId: string;
  newImageUrl: string;
}

export interface BloomHostBridge {
  ready: () => void;
  onInit: (callback: (payload: BloomHostInitPayload) => void) => () => void;
  onRequestClose: (callback: () => void) => () => void;
  commit: (replacements: BloomCommitReplacement[]) => Promise<void>;
  cancel: () => void;
  log: (level: "info" | "warn" | "error", message: string) => void;
  /** Ask the host to open a URL in the user's default browser (not the WebView).
   *  Used for OpenRouter OAuth so login happens with the user's normal browser
   *  identity; the resulting code is retrieved out-of-band via the localhost
   *  callback + `pollOAuthCodeFromBloomHost`. */
  openExternalUrl: (url: string) => void;
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

type WebViewMessage =
  | { type: "init"; payload: BloomHostInitPayload }
  | { type: "request-close" }
  | { type: "ack"; requestId: string; ok: boolean; error?: string };

type IframeMessage =
  | ({ channel: "bloom-ai-image-tools" } & WebViewMessage)
  | {
      channel: "bloom-ai-image-tools";
      type: "ready";
      payload: {};
    }
  | {
      channel: "bloom-ai-image-tools";
      type: "commit";
      requestId: string;
      payload: { replacements: BloomCommitReplacement[] };
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
    };

const uuid = () => Math.random().toString(36).slice(2, 10);
const iframeChannel = "bloom-ai-image-tools" as const;

type InitDebugState = {
  total: number;
  webview: number;
  iframe: number;
  lastBySource: {
    webview: { sessionToken: string; bookId: string; imageCount: number } | null;
    iframe: { sessionToken: string; bookId: string; imageCount: number } | null;
  };
};

const getInitDebugState = (): InitDebugState | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const globalWindow = window as Window & { __bloomAiInitDebugState?: InitDebugState };
  if (!globalWindow.__bloomAiInitDebugState) {
    globalWindow.__bloomAiInitDebugState = {
      total: 0,
      webview: 0,
      iframe: 0,
      lastBySource: {
        webview: null,
        iframe: null,
      },
    };
  }

  return globalWindow.__bloomAiInitDebugState;
};

const recordInitMessage = (source: "webview" | "iframe", payload: BloomHostInitPayload) => {
  const debugState = getInitDebugState();
  if (!debugState) {
    return;
  }

  debugState.total += 1;
  debugState[source] += 1;

  const nextSnapshot = {
    sessionToken: payload.sessionToken,
    bookId: payload.book.id,
    imageCount: payload.bookImages.length,
  };
  const previousSnapshot = debugState.lastBySource[source];
  const changedSincePrevious =
    !previousSnapshot ||
    previousSnapshot.sessionToken !== nextSnapshot.sessionToken ||
    previousSnapshot.bookId !== nextSnapshot.bookId ||
    previousSnapshot.imageCount !== nextSnapshot.imageCount;

  debugState.lastBySource[source] = nextSnapshot;

  console.info("[BloomHostBridge] init received", {
    source,
    totalCount: debugState.total,
    sourceCount: debugState[source],
    changedSincePrevious,
    sessionToken: payload.sessionToken,
    bookId: payload.book.id,
    bookTitle: payload.book.title,
    bookImageCount: payload.bookImages.length,
  });
};

const getWebViewApi = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    (
      window as Window & {
        chrome?: {
          webview?: {
            postMessage: (message: unknown) => void;
            addEventListener: (
              type: "message",
              listener: (event: MessageEvent<WebViewMessage>) => void,
            ) => void;
            removeEventListener: (
              type: "message",
              listener: (event: MessageEvent<WebViewMessage>) => void,
            ) => void;
          };
        };
      }
    ).chrome?.webview ?? null
  );
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

export const createWebViewBloomHostBridge = (): BloomHostBridge => {
  const webview = getWebViewApi();
  const initListeners = new Set<(payload: BloomHostInitPayload) => void>();
  const requestCloseListeners = new Set<() => void>();
  const pendingRequests = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();

  let httpBase = "";
  let sessionToken = "";

  // Session token is passed as a query param so no custom header is needed;
  // this avoids CORS preflight complexity with X-Bloom-Session in dev mode.
  const fileUrl = (name: string) =>
    `${httpBase}/file?name=${encodeURIComponent(name)}&session=${encodeURIComponent(sessionToken)}`;

  const handleMessage = (event: MessageEvent<WebViewMessage>) => {
    const message = event.data;
    if (!message) {
      return;
    }

    if (message.type === "init") {
      recordInitMessage("webview", message.payload);
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

  webview?.addEventListener("message", handleMessage);

  return {
    ready() {
      webview?.postMessage({ type: "ready", payload: {} });
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
      if (!webview) {
        return;
      }
      const requestId = uuid();
      const promise = new Promise<void>((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });
      });
      webview.postMessage({ type: "commit", requestId, payload: { replacements } });
      await promise;
    },
    cancel() {
      webview?.postMessage({ type: "cancel", payload: {} });
    },
    log(level, message) {
      webview?.postMessage({ type: "log", payload: { level, message } });
    },
    openExternalUrl(url) {
      webview?.postMessage({ type: "open-external", payload: { url } });
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

export const createIframeBloomHostBridge = (): BloomHostBridge => {
  const initListeners = new Set<(payload: BloomHostInitPayload) => void>();
  const requestCloseListeners = new Set<() => void>();
  const pendingRequests = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();

  let httpBase = "";
  let sessionToken = "";

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
      recordInitMessage("iframe", message.payload);
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
        pending.reject(new Error(message.error || "Bloom iframe host request failed."));
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
    async getFile(name) {
      if (!httpBase || !sessionToken) {
        throw new Error("Bloom iframe host bridge is not initialized.");
      }
      const response = await fetch(fileUrl(name));
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`Failed to read iframe host file ${name}: ${response.status}`);
      }
      if (name.endsWith(".png")) {
        const buffer = await response.arrayBuffer();
        return bytesToDataUrl(buffer);
      }
      return response.text();
    },
    async putFile(name, data) {
      if (!httpBase || !sessionToken) {
        throw new Error("Bloom iframe host bridge is not initialized.");
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
        throw new Error(`Failed to write iframe host file ${name}: ${response.status}`);
      }
    },
    async deleteFile(name) {
      if (!httpBase || !sessionToken) {
        throw new Error("Bloom iframe host bridge is not initialized.");
      }
      const response = await fetch(fileUrl(name), { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Failed to delete iframe host file ${name}: ${response.status}`);
      }
    },
    async clearAllFiles() {
      await Promise.allSettled([this.deleteFile("state.json"), this.deleteFile("connection.json")]);
    },
  };
};

type HarnessOptions = {
  initPayload: BloomHostInitPayload;
  onCommit?: (replacements: BloomCommitReplacement[]) => void;
  onCancel?: () => void;
  onReady?: () => void;
  initialFiles?: Record<string, string>;
};

export const createHarnessBloomHostBridge = (options: HarnessOptions): BloomHostBridge => {
  const initListeners = new Set<(payload: BloomHostInitPayload) => void>();
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

export const triggerHarnessRequestClose = (bridge: BloomHostBridge) => {
  const listeners: Array<() => void> = [];
  const unsubscribe = bridge.onRequestClose(() => {
    listeners.forEach((listener) => listener());
  });
  unsubscribe();
};
