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
 *   cancel / log / open-external / saveCredentials / analytics / ack) go over the channel; image and JSON file
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
import { HistoryImageSidecar, ImageCredits } from "../../types";

export interface IBloomHostBookImage {
  id: string;
  src: string;
  /** Where the slot sits, as the host names it for a reader: "Page 2", or a page's
   *  own name such as "Front Cover". A page that offers more than one slot says
   *  which one this is: "Page 2 - Canvas Background" for the picture behind the
   *  page, "Page 2 - Image 2" for the ones on top of it. The editor shows this
   *  above the slot, because slots can look identical — every empty one shows the
   *  same graphic — and this is then the only thing that tells the user which slot
   *  is which. */
  pageLabel?: string;
  width?: number;
  height?: number;
  /** True when the slot is EMPTY (in Bloom, an image placeholder). The editor
   *  shows its own placeholder graphic instead of trying to load the book's
   *  placeHolder.png, and treats the slot as holding no image at all: it cannot be
   *  dragged, edited, referenced, copied or downloaded. Launching on such a slot
   *  (selectedBookImageId) opens the "Create an Image" tool instead of filling the
   *  "Image to Edit" panel. */
  isPlaceholder?: boolean;
  /** The image's current IP credits as stored in the book. The editor carries
   *  these along edit chains and returns per-result credits on commit. */
  credits?: ImageCredits | null;
  /**
   * The resolution this slot wants, computed by the host from the size the
   * image container occupies on the page and the book's output medium (paper at
   * 300dpi, or a digital device class). The editor offers it as the Upscale
   * tool's "Auto" option; with the field absent or null there is no Auto option
   * and the selector starts at HD.
   *
   * `memo` is free text explaining how the host arrived at the number, e.g.
   * "1234 x 567 in order to achieve 300dpi for this 30mm x 20mm image
   * container". The editor shows it verbatim under the selector and never
   * parses it, so the host may word it however reads best.
   *
   * Omit the field when the container's size is unknown. Note that the numbers
   * are a request, not a promise: image models accept only coarse size tiers,
   * so a real model's output will not match exactly.
   */
  suggestedTarget?: { width: number; height: number; memo?: string } | null;
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
  /** When true, the host has no subscription covering AI image editing (a Bloom
   *  Playground/template book opens the editor anyway). The user can then look around
   *  the editor, but every tool that would call OpenRouter is disabled, as is the
   *  OpenRouter credential UI. The host sends no apiKey in this case either. */
  playgroundMode?: boolean;
  /** When true, the editor exposes developer-only affordances — currently the
   *  "Local Dummy (No AI)" model, a free deterministic engine offered on every
   *  tool for exercising edit flows without an AI call. The host sends true
   *  when it is itself in developer mode. Hostname gating is not enough when
   *  hosted (Bloom serves the editor from localhost even for end users), so
   *  absent/false means hidden. Standalone dev builds are unaffected. */
  showDeveloperTools?: boolean;
  /** Root of Bloom's local AI-image-editor HTTP API, e.g.
   *  `http://localhost:8089/bloom/api/aiImageEditor`. The port is whatever Bloom's
   *  server actually bound (8089 is only its default), so this is always supplied by
   *  the host at runtime and never hard-coded outside the dev harness. */
  httpBase: string;
  sessionToken: string;
  /** Which language the host's UI is in ("en", "fr", "es-419"). The editor uses it for text
   *  it never translates (the art style descriptions), which it hides rather than showing in
   *  English inside a translated host. Absent means English. */
  uiLanguageId?: string;
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
  /** The result's IP credits, as determined by the editor: the source image's
   *  credits when the result was made by editing it, or null when the result
   *  has none (brand-new generation, in-editor upload). Always present so the
   *  host never has to guess: it embeds exactly this — null means embed none,
   *  NOT "keep the replaced slot's old credits". */
  credits: ImageCredits | null;
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
  /** Tell the host the editor has put a modal of its own on screen, so the host can get
   *  its own chrome out of the way. Bloom draws its close button on top of the iframe,
   *  where nothing the editor renders can cover it, and two close buttons a few pixels
   *  apart invite shutting the whole tool when you meant to leave the dialog. Fire and
   *  forget: a host that does not implement it simply keeps its chrome. */
  setModalOpen: (open: boolean) => void;
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
  /** Report an analytics event for the host to record (Bloom forwards it to Segment). Fire
   *  and forget: there is no ack, and a host that does not implement it is fine -- the editor
   *  must never depend on this having gone anywhere.
   *
   *  NEVER pass prompt text, parameter values, image names, or anything else the user typed or
   *  lifted out of their book: a prompt can contain arbitrary content. Counts, enum choices,
   *  durations, costs and model ids only.
   *
   *  The events the editor sends, and the properties each one carries, are defined in
   *  lib/analyticsEvents.ts. The host accepts only event names and properties it knows, so
   *  anything added there needs a matching change on the host side. */
  trackEvent: (event: string, properties?: Record<string, string | number | boolean>) => void;
  /** Translate the editor's whole string table in one round-trip: takes every localization
   *  ID with its English default and returns what the host has for the current UI language.
   *  An ID the host does not know is left out and the editor shows the English, so a host
   *  with no translations can return the table it was given. */
  getLocalizations: (strings: Record<string, string>) => Promise<Record<string, string>>;
  /** The host's UI language ("en", "fr", "es-419"), as the host told us in its init message.
   *  "en" until init arrives and for a host that does not say, which keeps every string
   *  visible rather than hiding text on a guess. */
  getUiLanguageId: () => Promise<string>;
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
  /** A URL the browser can fetch the named file from (an `<img src>`, a `fetch`),
   *  or null when the host has no such URL to offer. Lets the editor reference a
   *  freshly written image by URL, the way host-enumerated history already is,
   *  instead of holding its base64 for the rest of the session. */
  getFileUrl?: (name: string) => string | null;
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
      type: "modal-open";
      payload: { open: boolean };
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
    }
  | {
      channel: "bloom-ai-image-tools";
      type: "analytics";
      payload: {
        event: string;
        properties?: Record<string, string | number | boolean>;
      };
    };

const uuid = () => Math.random().toString(36).slice(2, 10);
const iframeChannel = "bloom-ai-image-tools" as const;

/** How long getLocalizations waits for Bloom's init message before settling for English. */
const kInitWaitMs = 10000;

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
  let uiLanguageId = "";

  // Bloom tells us where its API lives in the init message, which arrives after the
  // editor has mounted. Anything that needs httpBase before a user action -- fetching
  // the translations -- has to wait for this.
  let markInitialized: () => void = () => {};
  const initialized = new Promise<void>((resolve) => {
    markInitialized = resolve;
  });

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
      uiLanguageId = message.payload.uiLanguageId ?? "";
      markInitialized();
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
    setModalOpen(open) {
      postToParent({ channel: iframeChannel, type: "modal-open", payload: { open } });
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
    trackEvent(event, properties) {
      postToParent({
        channel: iframeChannel,
        type: "analytics",
        payload: { event, properties },
      });
    },
    async getLocalizations(strings) {
      // Two endpoints, newest first.
      //
      // `aiImageEditor/localizations` (Bloom 6.5+) answers the whole table with the
      // translations it has and stays quiet about the rest. Bloom's general-purpose
      // `i18n/loadStrings` reports every id it cannot find -- a toast and a line in the
      // developer's local xlf, per string, on every launch -- which for a table this size is
      // unusable, so it is only the fallback for a Bloom that predates the other.
      //
      // httpBase is Bloom's API root plus this feature's segment, so i18n is its sibling.
      // Anything short of an answer leaves the editor in English, which is a working editor,
      // so nothing here is worth failing over.
      // The editor asks for these the moment it mounts, which is before Bloom has told
      // us where to ask. Without this wait the whole table comes back in English and is
      // cached that way for the session.
      await Promise.race([initialized, new Promise((resolve) => setTimeout(resolve, kInitWaitMs))]);
      if (!httpBase) {
        return strings;
      }
      try {
        const response = await fetch(`${httpBase}/localizations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(strings),
        });
        if (response.ok) {
          return (await response.json()) as Record<string, string>;
        }
      } catch {
        // Fall through to the older endpoint.
      }
      try {
        const body = new URLSearchParams();
        for (const [id, english] of Object.entries(strings)) {
          body.append(id, english);
        }
        const url = new URL("../i18n/loadStrings", `${httpBase}/`).toString();
        const response = await fetch(url, { method: "POST", body });
        if (!response.ok) {
          return strings;
        }
        return (await response.json()) as Record<string, string>;
      } catch {
        return strings;
      }
    },
    async getUiLanguageId() {
      // The host tells us this in its init message; we never ask it, so this bridge needs no
      // knowledge of any host API to answer.
      await Promise.race([initialized, new Promise((resolve) => setTimeout(resolve, kInitWaitMs))]);
      return uiLanguageId || "en";
    },
    getFileUrl(name) {
      if (!httpBase || !sessionToken) {
        return null;
      }
      return fileUrl(name);
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
  // Object URLs handed out by getFileUrl, keyed by file name. A real host serves
  // files over HTTP; here the nearest thing is a blob URL over the stored bytes, so
  // the editor's swap from base64 to URL runs in the harness and its e2e tests too.
  const objectUrlByName = new Map<string, string>();
  const revokeObjectUrl = (name: string) => {
    const url = objectUrlByName.get(name);
    if (!url) return;
    objectUrlByName.delete(name);
    URL.revokeObjectURL(url);
  };

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
    setModalOpen() {
      // The harness draws no chrome of its own over the editor, so there is nothing
      // to get out of the way.
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
    trackEvent(event, properties) {
      // No analytics service in standalone/harness mode; log it so a developer can see
      // exactly what a real host would have been sent.
      console.info(`[BloomHarness] analytics: ${event}`, properties);
    },
    async getLocalizations(strings) {
      // No Bloom to ask in standalone/harness mode: the English defaults stand.
      return strings;
    },
    async getUiLanguageId() {
      // Standalone/harness mode is English.
      return "en";
    },
    getFileUrl(name) {
      const existing = objectUrlByName.get(name);
      if (existing) return existing;
      const data = fileStore.get(name);
      if (typeof URL === "undefined" || !data || !data.startsWith("data:")) {
        return null;
      }
      const mimeType = data.slice("data:".length, data.indexOf(";")) || "image/png";
      const url = URL.createObjectURL(new Blob([dataUrlToBytes(data)], { type: mimeType }));
      objectUrlByName.set(name, url);
      return url;
    },
    async getFile(name) {
      return fileStore.get(name) ?? null;
    },
    async putFile(name, data) {
      revokeObjectUrl(name);
      fileStore.set(name, data);
    },
    async deleteFile(name) {
      revokeObjectUrl(name);
      fileStore.delete(name);
    },
    async clearAllFiles() {
      Array.from(objectUrlByName.keys()).forEach(revokeObjectUrl);
      fileStore.clear();
    },
  };
};
