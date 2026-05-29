import { PersistedImageToolsState } from "../../types";

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
  httpBase?: string;
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
  loadState: (namespace: string) => Promise<PersistedImageToolsState | null>;
  saveState: (namespace: string, state: PersistedImageToolsState) => Promise<void>;
  clearState: (namespace: string) => Promise<void>;
}

type WebViewMessage =
  | { type: "init"; payload: BloomHostInitPayload }
  | { type: "request-close" }
  | { type: "ack"; requestId: string; ok: boolean; error?: string };

const uuid = () => Math.random().toString(36).slice(2, 10);

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

const loadLocalState = async (namespace: string) => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(namespace);
    return raw ? (JSON.parse(raw) as PersistedImageToolsState) : null;
  } catch {
    return null;
  }
};

const saveLocalState = async (namespace: string, state: PersistedImageToolsState) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(namespace, JSON.stringify(state));
};

const clearLocalState = async (namespace: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(namespace);
};

export const createWebViewBloomHostBridge = (): BloomHostBridge => {
  const webview = getWebViewApi();
  const initListeners = new Set<(payload: BloomHostInitPayload) => void>();
  const requestCloseListeners = new Set<() => void>();
  const pendingRequests = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();

  const handleMessage = (event: MessageEvent<WebViewMessage>) => {
    const message = event.data;
    if (!message) {
      return;
    }

    if (message.type === "init") {
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
    loadState: loadLocalState,
    saveState: saveLocalState,
    clearState: clearLocalState,
  };
};

type HarnessOptions = {
  initPayload: BloomHostInitPayload;
  onCommit?: (replacements: BloomCommitReplacement[]) => void;
  onCancel?: () => void;
  onReady?: () => void;
};

export const createHarnessBloomHostBridge = (options: HarnessOptions): BloomHostBridge => {
  const initListeners = new Set<(payload: BloomHostInitPayload) => void>();
  const requestCloseListeners = new Set<() => void>();

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
    loadState: loadLocalState,
    saveState: saveLocalState,
    clearState: clearLocalState,
  };
};

export const triggerHarnessRequestClose = (bridge: BloomHostBridge) => {
  const listeners: Array<() => void> = [];
  const unsubscribe = bridge.onRequestClose(() => {
    listeners.forEach((listener) => listener());
  });
  unsubscribe();
};
