# Bloom Host Integration Plan

> **Status note (kept for history).** This is the original design plan; the shipped
> implementation diverged in two ways. (1) The editor is embedded as an **iframe overlay
> inside Bloom's existing edit-tab WebView2**, not a dedicated WebView2 window (so the
> `chrome.webview` "WebView bridge" path described below was retired in favour of the
> iframe/postMessage path — see `services/host/BloomHostBridge.ts`). (2) `BloomHostShell`
> was renamed `BloomEmbeddedShell`. For the current architecture read the header comments
> in `BloomHostBridge.ts`, `App.tsx`, and (Bloom side) `AiImageEditorApi.cs`, plus the
> "How Bloom hosts this editor" section of the README.

## Goal

Make this app embeddable inside a Bloom WebView2 window, while keeping it runnable
standalone for development and testing. When embedded, Bloom supplies the book's
images, owns history and reference folders, owns API credentials, and ultimately
swaps in the user's chosen replacement images when the window closes.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Standalone:  App.tsx → StandaloneShell                   │
│   • API-key dialog, dev overlays, sample book images     │
│   • IndexedDB persistence                                │
│   • No commit concept (or dev-only "log replacements")   │
│                      │                                   │
│                      ▼                                   │
│   ImageToolsWorkspace (core — host-agnostic)             │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Bloom:       index-bloom.tsx → BloomHostShell            │
│   • BloomHostBridge (postMessage + HTTP)                 │
│   • Waits for `init`, then mounts core                   │
│   • Commit button, request-close handler                 │
│   • HTTP-backed persistence                              │
│                      │                                   │
│                      ▼                                   │
│   ImageToolsWorkspace (same core — host-agnostic)        │
└──────────────────────────────────────────────────────────┘
```

The `ImageToolsWorkspace` core is **genuinely host‑agnostic**. It has no
notion of "Bloom mode" — no `if (host)` branches, no awareness of `commit` or
`request-close`. The core just renders the workspace, runs tools, and maintains
pair‑slot state. The shell decides what "done" means.

Two injection points only:

1. `persistence` — already exists. Standalone backs it with IndexedDB; Bloom
   shell backs it with an HTTP adapter that talks to Bloom's localhost server.
   The core sees the same interface either way.
2. `onReplacementsChange?: (map: Record<incomingId, HistoryEntry | null>) => void`
   — fired whenever the user assigns or clears an outgoing slot. Standalone
   may ignore it (or use it for a dev log). Bloom shell uses it to track what
   to send on commit.

## The split: shell vs. core

### Lives in the shell (not the core)

- API‑key entry dialog, env‑key handling, dev seed helpers, drag‑timing overlay
  (standalone shell only).
- Persistence selection: `createBrowserImageToolsPersistence` in standalone,
  `createBloomHostPersistence(bridge)` in Bloom shell.
- The `BloomHostBridge` itself (postMessage/HTTP adapter).
- Lifecycle: handling `init` (seed core's initial images + persistence config),
  the in‑app Commit button, `request-close` handler, sending `commit`/`cancel`.
- Standalone seed images (the four sample art styles) — passed into the core
  as initial Book Images strip content.

### Stays in the core

- `ImageToolsWorkspace` and everything it currently renders (tools panel,
  canvas, history strip, thumbnail strip).
- All tool execution logic, OpenRouter client, art styles, etc.
- The Book Images strip, renamed from the current environment-strip model.

### New in the core

- **Pair‑slot rendering on the Book Images strip, unconditionally.** Every
  incoming image gets an outgoing slot underneath. Works the same in
  standalone and Bloom modes.
- `onReplacementsChange` prop (described above).
- `incomingSlotId` on every history entry — the GUID of the incoming book
  image this generation descended from. Used today for "Use this" routing
  and the per‑slot history view we may build later.
- "Use this" button in the result pane (always present when there's a current
  result with an `incomingSlotId`).

## Communication protocol (WebView2)

Per discussion: Option A — `window.chrome.webview.postMessage` + virtual host
file mapping. Bloom maps `https://bloom-book.invalid/` to the book folder and
`https://bloom-refs.invalid/` to the shared reference folder. Images are
referenced by URL; no base64 over the bridge.

### Detection

```ts
const isBloomHosted = typeof window !== "undefined" && !!window.chrome?.webview;
```

### Messages — Host → App (postMessage, pub/sub)

| `type`          | Payload                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`          | `{ book: { id, title }, bookImages: [{ id: guid, src: url, pageLabel?, width?, height? }], historyFolderUrl, referenceFolderUrl, references: [{ id, src, name? }], apiKey, openRouterUser?, httpBase: string, sessionToken: string }` |
| `request-close` | `{}` — Bloom asks the app to commit/cancel (e.g. window X button). App responds with `commit` (RPC) or `cancel`.                                                                                                                      |

References are sent once in `init` and never change from outside while the app
is running (Bloom blocks other writers to that folder for the duration of the
session), so there's no `references-changed` message. The app maintains the
list in memory and updates it optimistically when its own `save-reference` /
`delete-reference` HTTP calls succeed.

### Messages — App → Host (postMessage, pub/sub)

| `type`   | Payload                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| `ready`  | `{}` — sent on mount; Bloom replies with `init`.                                                               |
| `cancel` | `{}` — user closed without committing. Nothing is lost; history persists in the per‑book folder for next time. |
| `log`    | `{ level, message }` — surfaces app logs to Bloom's logger.                                                    |

### File operations — App → Host (HTTP)

All file writes/deletes go through Bloom's localhost server. Each request
carries `X-Bloom-Session: <sessionToken>` from `init`.

| Method | Path                               | Body                                |
| ------ | ---------------------------------- | ----------------------------------- |
| POST   | `/imageTools/history`              | raw image bytes; `?filename=<name>` |
| DELETE | `/imageTools/history/{filename}`   | —                                   |
| POST   | `/imageTools/reference`            | raw image bytes; `?filename=<name>` |
| DELETE | `/imageTools/reference/{filename}` | —                                   |

HTTP already gives request/response, so these don't need a postMessage RPC wrapper.

### RPC — App → Host (postMessage with correlation)

A thin RPC wrapper is used **only for calls that can fail and aren't HTTP** —
currently just `commit`. Implementation: app sends
`{ type, requestId, payload }`, Bloom replies with
`{ type: "ack", requestId, ok, error? }`. Wrapped in a
`host.request("commit", {...}): Promise<void>` helper.

| `type`   | Payload                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| `commit` | `{ replacements: [{ incomingId: guid, newImageUrl: string }] }` — Bloom applies, acks, then closes the window. |

### File writes

WebView2 JS cannot write files directly. **Decision: localhost POST** against
Bloom's existing HTTP server. Avoids the ~33% base64 overhead and lets Bloom
do its own atomic-write / error-handling on the server side.

- App POSTs raw bytes to e.g.
  `http://localhost:PORT/imageTools/history` and `/imageTools/reference`
  (DELETE on the same paths for removal).
- Bloom passes a per-session token in the `init` message; the app includes it
  as a header (`X-Bloom-Session: <token>`) on every request so other localhost
  processes can't write into the book.
- The mock Bloom host (dev mode) stubs uploads as no-op fetches that log to
  the console.

## Pair‑slot UI

Each tile in the Book Images strip is a vertically stacked **pair**: incoming on
top, outgoing slot on the bottom. This is core behavior, present in both
standalone and Bloom modes — standalone exercises it for dev and testing,
Bloom uses the resulting map for `commit`.

```
┌─────────────┐
│  incoming   │   ← original book image (read-only)
├─────────────┤
│  outgoing   │   ← drop target; empty = "keep original"
└─────────────┘
```

### Assignment paths

- Drag from the history strip → drop onto a pair's outgoing slot.
- "Use this" button in the result pane → assigns to the outgoing slot of the
  pair whose incoming was the **current edit target**.
- Click an outgoing slot → clears it (revert to "keep original").

### Tracking incoming lineage

To make "Use this" route correctly even three generations into editing, every
history entry carries the GUID of the incoming image whose pair it belongs to.

```ts
interface HistoryEntry {
  id: string;
  src: string;
  // … existing fields …
  incomingSlotId?: string; // NEW — guid from init.bookImages[].id
}
```

Propagation rule: when a tool runs against a target image that _is_ a history
entry, the result inherits that entry's `incomingSlotId`. When a tool runs
against an incoming image directly, the result's `incomingSlotId` = that
incoming's id. Tools that generate from scratch (no target) produce entries
with `incomingSlotId = undefined`; these don't auto‑route via "Use this" but
can still be dragged into any slot.

(UI for browsing per‑slot history is **out of scope** for v1 — we keep the flat
history strip. The field is recorded now so we can add that view later without
a data migration.)

## Persistence adapter changes

`ImageToolsPersistence` (the existing interface) gains methods that the
standalone implementation backs with IndexedDB and the Bloom implementation
backs with host messages:

- `loadHistory()` / `saveHistory(entry)` / `deleteHistoryEntry(id)`
- `loadReferences()` / `saveReference(entry)` / `deleteReference(id)`
- `getApiKey()` / `setApiKey(key)` — in Bloom mode, `getApiKey` returns the
  key from the `init` message and `setApiKey` is a no‑op.

We may not need new methods at all if the current interface already covers
these (TBD on first pass through `services/persistence/`). The point is: the
core calls the same methods; only the implementation differs.

## Cancel / close semantics

- User hits the window's close button → Bloom sends `request-close` → app
  immediately sends `cancel`. No confirmation dialog. The per‑book history
  folder retains everything, so reopening shows the same state.
- User clicks the in‑app "Commit" button → app sends `commit` with the
  replacements map → Bloom applies, closes the window.

## Build / dev experience

- `pnpm dev` continues to launch the standalone shell (current behavior).
- Add a concrete in-repo Bloom host harness for end-to-end coverage and local
  integration work. It should:
  - Simulate `init` with fixed sample book image data.
  - Exercise the real bridge and shell contracts with deterministic local data.
  - Expose stable test IDs for host actions and captured commit payloads.

  This keeps Playwright coverage on a real harness instead of a mock-host flow.

## Work breakdown

1. **Refactor shell vs. core.** Move API‑key dialog, env‑key handling, dev
   overlays, and seed wiring out of `ImageToolsWorkspace` and into a new
   `StandaloneShell` consumed by `App.tsx`. The core should accept everything
   it needs via props — no `import.meta.env` checks inside it.
2. **Rename the current environment-strip model to Book Images.** Replace the
   `environment` strip id/config/props with `bookImages` naming across the app,
   including persistence migration for old saved strip state.
3. **Pair‑slot UI on the Book Images strip (core).** Every tile becomes an
   incoming/outgoing pair. Drag‑drop wiring reuses existing dnd infrastructure.
   Add the `onReplacementsChange` prop.
4. **`incomingSlotId` propagation (core).** Thread through tool execution
   result handling. Add the "Use this" button to the result pane (routes to
   the slot identified by the current result's `incomingSlotId`).
5. **Define `BloomHostBridge`.** A thin TypeScript module that owns
   `postMessage`, an event emitter for incoming messages, typed senders, and
   the RPC correlation for `commit`. No React. Lives in `services/host/`.
6. **Rename the host protocol payload to use `bookImages`.** Keep product
   language and bridge typing consistent by renaming the legacy `images`
   field to `bookImages`.
7. **`BloomHostPersistence`.** Implements `ImageToolsPersistence` against
   Bloom's localhost HTTP server (using `httpBase` + `sessionToken` from
   `init`). Replaces IndexedDB for history and references; reads API key from
   `init`.
8. **`BloomHostShell`.** Consumes `BloomHostBridge`, waits for `init`, mounts
   `ImageToolsWorkspace` with the HTTP persistence and the initial book images,
   renders the Commit button, handles `request-close`, sends `commit`/`cancel`.
9. **Bloom host harness.** Add a real in-repo harness for local integration and
   Playwright coverage rather than a mock-host test flow.
10. **End‑to‑end tests.** Add Playwright scenarios for harness init, Book Images
    rendering, Use this assignment, drag/drop replacement, request-close →
    cancel, and commit payload assertions.

## Resolved design decisions

- **Binary file transfer:** localhost POST to Bloom's HTTP server with a
  per‑session token header. No base64 over the postMessage bridge.
- **RPC:** thin request/response wrapper on postMessage used only for `commit`.
  Everything else is either pure pub/sub (notifications, logs) or plain HTTP
  (file writes/deletes), both of which already have appropriate semantics.
- **References freshness:** Bloom blocks external modification of the
  reference folder while the app is open, so the list is sent once in `init`
  and maintained in‑memory with optimistic updates on the app's own writes.
  No watcher, no refresh, no `references-changed` message.

---

# Bloom Editor (Host) Integration — Implementation Plan (v1)

This section plans the **host side** work in the Bloom Editor repo (symlinked at
[BloomEditor/](BloomEditor/), real path `d:\bloom.worktrees\AddAIImages`) plus the
small companion changes needed in **this** repo to make the editor persist into a
Bloom‑owned folder. It supersedes the parts of the sections above that assume
book‑image sharing and commit — those are explicitly **out of scope for v1**.

## v1 scope

**In scope.** Bloom launches the AI editor in a near‑full‑screen WebView2 window
from the image context menu, gives it a per‑book `.ai-image-editor` folder, and the
editor persists its history images, metadata state, and OpenRouter connection info
into that folder so a relaunch restores the previous session.

**Out of scope (deferred).** Sharing the book's images into the editor, the
incoming/outgoing pair‑slot UI, the "Commit"/`commit` RPC that sends replacements
back, references, and any modification of the book itself. The editor opens with an
empty Book Images strip and the user works entirely inside the editor.

## Decisions locked (from review)

| Topic           | Decision                                                                                                                                                                                                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Packaging**   | The editor is a **self‑contained app bundle** — its own `index.html` + JS with React 19 / MUI 7 bundled in. Bloom loads it into a WebView2 as a standalone page; **no React sharing** with Bloom (which is React 17).                                                                                                               |
| **Folder I/O**  | New **BloomServer HTTP endpoints** scoped to the book's `.ai-image-editor` folder (GET/POST/DELETE files). The editor uses `fetch`. Reuses Bloom's existing API infra (`RegisterEndpointHandler`, `RawPostData`, `ReplyWithFileContent`).                                                                                           |
| **API key**     | The **editor owns** the OpenRouter key. Bloom supplies only the folder; the editor writes connection info into `.ai-image-editor/connection.json` and reads it back on relaunch. Bloom never sees the key.                                                                                                                          |
| **Dev linking** | Fast loop = Bloom WebView2 points at the editor's **Vite dev server** (`http://localhost:3000`), mirroring how Bloom already loads its own React from `localhost:5173`. `yarn link` is used only to exercise the production asset‑copy path before publishing. See [Dev & build workflow](#dev--build-workflow-the-linking-answer). |

## Why self‑contained (the React conflict)

This repo is React **19.2** + MUI **7**; `BloomBrowserUI` is pinned to React
**17.0.2** with a single `node_modules`. A WebView2 window is its own browser
document, so the editor page runs its **own** React 19 with zero contact with
Bloom's React 17. We therefore do **not** add the editor to Bloom's Vite entry
points or its `bundleToViteModulePathMap`; Bloom only needs a URL to navigate to.

## The `.ai-image-editor` folder

Created on demand inside the current book folder
(`BookSelection.CurrentSelection.FolderPath`). Layout mirrors the split already used
by `services/persistence/browserPersistence.ts` (metadata separate from image bytes):

```
<book folder>/
  .ai-image-editor/
    state.json            ← PersistedImageToolsState with history[].imageData = ""
    connection.json       ← { apiKey, authMethod, openRouterUser? }  (editor-owned)
    history/
      <imageRecordId>.png  ← decoded PNG bytes, one per history entry
```

- `state.json` is the metadata‑only state (exactly what `browserPersistence` writes
  to its `:meta` key today — history entries keep all fields except `imageData`,
  which is blanked).
- Each history image is a real PNG file (base64 decoded to bytes on write, re‑encoded
  to base64 on read), so the folder is human‑inspectable and portable with the book.
- `.ai-image-editor` should be excluded from Bloom's book‑bundling/upload and from the
  "doomed images" sweep in `BookStorage` (see step H7) so Bloom never ships or prunes it.

## Communication contract for v1

A pared‑down version of the protocol above. The bridge already exists in
[services/host/BloomHostBridge.ts](services/host/BloomHostBridge.ts); v1 trims the
payload and **replaces the localStorage‑backed state methods with HTTP**.

### `init` (Host → App), v1 shape

```ts
{
  book: { id: string; title: string };
  folderUrl?: string;        // optional convenience; reads also work via httpBase
  httpBase: string;          // e.g. "http://localhost:8089/bloom/api/aiImageEditor"
  sessionToken: string;      // sent as X-Bloom-Session on every file request
  bookImages: [];            // empty in v1
  references: [];            // empty in v1
  apiKey: null;              // editor owns the key in v1
}
```

The existing `BloomHostInitPayload` interface already makes the v1‑irrelevant fields
optional/empty‑able, so no breaking type change is required — just stop populating
them on the host side.

### File endpoints (App → Host, HTTP)

All scoped to `<book>/.ai-image-editor`, all require `X-Bloom-Session: <sessionToken>`.
Filenames are validated server‑side (no traversal, allowlisted to
`state.json`, `connection.json`, `history/<id>.png`).

| Method | Path (under `httpBase`)       | Body / Result                                   |
| ------ | ----------------------------- | ----------------------------------------------- |
| GET    | `/file?name=state.json`       | JSON text (404 if absent → editor starts fresh) |
| POST   | `/file?name=state.json`       | raw JSON bytes                                  |
| GET    | `/file?name=connection.json`  | JSON text (404 if absent)                       |
| POST   | `/file?name=connection.json`  | raw JSON bytes                                  |
| GET    | `/file?name=history/<id>.png` | image bytes                                     |
| POST   | `/file?name=history/<id>.png` | raw image bytes                                 |
| DELETE | `/file?name=history/<id>.png` | —                                               |

(Single generic `/file` endpoint with a `name` query keeps the C# handler small and
the allowlist in one place; we can split later if useful.)

### postMessage messages retained in v1

- App → Host: `ready`, `cancel`, `log`.
- Host → App: `init`, `request-close`.
- **Dropped in v1:** `commit` RPC (and its `ack`). The Cancel/close path just sends
  `cancel`; nothing is committed because nothing is shared back yet.

## Component‑side changes (this repo)

These are the companion changes that the "implemented" component side still needs so
that persistence lands in the Bloom folder instead of `localStorage`.

- **C1 — HTTP‑backed bridge.** In
  [services/host/BloomHostBridge.ts](services/host/BloomHostBridge.ts), the WebView
  bridge currently stores state in `localStorage` (`loadLocalState`/`saveLocalState`/
  `clearLocalState`). That cannot persist across launches because WebView2 uses a
  fresh temp user‑data folder each time. Capture `httpBase` + `sessionToken` from
  `init` and back the file operations with `fetch`. Expose granular file ops the
  persistence layer can call (e.g. `getFile(name)`, `putFile(name, bytes|json)`,
  `deleteFile(name)`), keeping `loadState/saveState/clearState` as thin wrappers over
  `state.json`.
- **C2 — Folder‑splitting Bloom persistence.** Update
  [services/persistence/bloomHostPersistence.ts](services/persistence/bloomHostPersistence.ts)
  to mirror `browserPersistence`'s split: on `save`, write `state.json` with
  `imageData` blanked and POST each changed history image to `history/<id>.png`
  (base64 → bytes); on `load`, GET `state.json` then hydrate each entry's `imageData`
  by GETting its PNG (bytes → base64); track last‑saved hashes to avoid re‑POSTing
  unchanged images and to DELETE removed ones — the diff logic already exists in
  `browserPersistence` and can be factored into a shared helper.
- **C3 — Editor‑owned connection info.** In Bloom mode, route the editor's API‑key
  get/set to `connection.json` via the bridge (instead of the current "no‑op in Bloom
  mode" behavior). The editor's existing settings/API‑key dialog stays; only its
  persistence target changes. On launch, if `connection.json` has a key, the editor
  authenticates without prompting.
- **C4 — A stable hosted entry/build.** Confirm the standalone build (`vp build` →
  demo output, the `index.html` app — not the tsup library output) is what Bloom
  loads. Detection in [App.tsx](App.tsx) already branches to `BloomHostShell` when
  `window.chrome.webview` is present, so the **same** built app works both
  standalone‑in‑browser and hosted‑in‑WebView2. The published npm package should
  include this standalone app build (e.g. a `dist-app/` directory) in `files`, in
  addition to the library `dist/`.
- **C5 — CORS in dev.** When loaded from the Vite dev server (`:3000`) the editor's
  `fetch` calls hit Bloom's server (`:8089`) cross‑origin. The host endpoints must
  send `Access-Control-Allow-Origin` for the dev origin and answer the `OPTIONS`
  preflight allowing the `X-Bloom-Session` header. (Production is same‑origin — see
  below — so this only matters for the dev loop.)

## Bloom‑side changes (host repo)

References below are to files surfaced during exploration; treat line numbers as
approximate.

- **H1 — Menu item.** Add "Edit with AI…" to the image context menu in
  `BloomEditor/src/BloomBrowserUI/bookEdit/js/CanvasElementContextControls.tsx`
  (`addImageMenuOptions()`, alongside "Choose image from your computer…"). On click,
  `postData("editView/launchAiImageEditor", { imageId, imageSrc })` (or a dedicated
  `aiImageEditor/launch` endpoint — see H2). v1 ignores the specific image; the menu
  item is just the entry point.
- **H2 — New C# API class `AiImageEditorApi`.** A new controller under
  `BloomEditor/src/BloomExe/web/controllers/` registered with `BloomApiHandler`
  (follow `BookMetadataApi.cs`). Responsibilities:
  - `aiImageEditor/launch` (POST, UI thread): ensure the folder exists, then open the
    dialog (H4).
  - `aiImageEditor/file` (GET/POST/DELETE): the folder file endpoints. Validate
    `X-Bloom-Session`, allowlist `name`, resolve under
    `CurrentBook.FolderPath/.ai-image-editor`, use `request.RawPostData` for writes
    and `request.ReplyWithImage` / `ReplyWithFileContent` (or a JSON reply) for reads.
  - Holds the per‑session token minted at launch.
- **H3 — Folder creation.** On launch, create
  `Path.Combine(CurrentBook.FolderPath, ".ai-image-editor")` and its `history/`
  subfolder if absent (`RobustIO`/`Directory.CreateDirectory`).
- **H4 — Near‑full‑screen WebView2 window.** Reuse the existing dialog plumbing
  (`ReactDialog` → `ReactControl` → `WebView2Browser`, in
  `BloomEditor/src/BloomExe/MiscUI/ReactDialog.cs` and `web/ReactControl.cs`) **but**
  point the WebView2 at the editor's URL rather than a Bloom Vite bundle. Because the
  editor is self‑contained, the cleanest path is a thin custom form that hosts a
  `WebView2Browser` and navigates to the editor URL (H5), sized to ~95% of the work
  area / maximized. The existing `bundleToViteModulePathMap` is **not** touched.
- **H5 — Editor URL resolution (dev vs prod).**
  - **Dev:** navigate to `http://localhost:3000/?...` (the editor's running Vite dev
    server) when a dev flag/env is set. Gives HMR on editor edits.
  - **Prod:** serve the editor's built app from Bloom's own server so it is
    **same‑origin** with `/bloom/api/...` (no CORS). Copy the package's `dist-app/`
    into `output/browser/aiImageEditor/` at build time and navigate to
    `…/bloom/aiImageEditor/index.html`.
- **H6 — init / messaging wiring.** After the WebView2 signals it's ready (the editor
  posts `ready` via `chrome.webview.postMessage`), C# handles `WebMessageReceived`
  and posts back the v1 `init` payload (book id/title, `httpBase` pointing at the
  `aiImageEditor` API root, freshly minted `sessionToken`). Handle `cancel` and `log`.
  On the window's close (X) button, send `request-close` and let the editor reply
  `cancel`, then close. (`WebView2Browser` already exposes
  `WebMessageReceived` and `RunJavascriptAsync`/post helpers.)
- **H7 — Exclude the folder from book operations.** Ensure `.ai-image-editor` is
  ignored by `BookStorage`'s unused‑image cleanup and by book upload/bundling so it is
  neither pruned nor shipped. Add it to the relevant skip lists.

## Dev & build workflow (the linking answer)

With the self‑contained decision, the fast inner loop does **not** depend on
`yarn link` vs Vite alias — those matter only when one project _bundles_ the other,
which Bloom no longer does. Instead:

1. **Fast loop (recommended default).** Run this repo's `vp dev` (editor on
   `http://localhost:3000`). Run Bloom with a dev flag that makes H5 navigate the
   WebView2 to `localhost:3000`. Editor code edits hot‑reload inside Bloom's WebView2
   instantly; only C# changes require a Bloom rebuild. This is the analogue of
   Bloom's own `localhost:5173` React dev mode, so it fits existing developer muscle
   memory. **No copy step, no linking.**
2. **Production‑path check (before publishing).** To exercise the same‑origin served
   build: `yarn link` this package from `BloomBrowserUI` (matches how Bloom links
   `bloom-player`), build the editor app, and have Bloom's build copy `dist-app/` into
   `output/browser/aiImageEditor/`. Use this to validate H5‑prod and CORS‑free
   operation. `file:` and Vite alias are viable alternatives but unnecessary given the
   dev‑server loop above.
3. **`BloomBrowserUI/package.json` dependency.** Add `bloom-ai-image-tools` as a
   dependency so the production copy step has a resolvable source. During dev this can
   be the `yarn link` symlink; post‑publish it becomes a normal version range.

## Work breakdown (ordered)

Component side (this repo) and host side (Bloom) can largely proceed in parallel;
the contract in [Communication contract for v1](#communication-contract-for-v1) is the
seam.

1. **C1/C2/C3** — HTTP‑backed bridge, folder‑splitting persistence, connection.json.
   Land behind the existing `window.chrome.webview` detection; verify against the
   in‑repo harness with a fake HTTP layer first.
2. **C4** — produce and package the standalone app build (`dist-app/`); confirm the
   hosted entry works when opened in a real WebView2.
3. **H2/H3** — `AiImageEditorApi` with folder creation + the `/file` endpoints; unit
   test path validation and session‑token enforcement.
4. **H4/H5/H6** — the WebView2 window, dev/prod URL resolution, and init/messaging.
5. **H1** — the context‑menu item that calls `launch`.
6. **C5/H5‑prod** — CORS for the dev origin; the prod same‑origin asset copy.
7. **H7** — exclude `.ai-image-editor` from cleanup/upload.
8. **End‑to‑end smoke:** open editor from menu → generate an image → close →
   reopen → history, state, and API key all restored from the folder.

## Open questions / deferred

- **Window chrome:** borderless maximized form vs. a titled resizable dialog? (H4 —
  default to maximized with a close button; cosmetic, decide during implementation.)
- **Multiple books / stale sessions:** the session token is per‑launch; confirm Bloom
  rejects file requests after the window closes (token invalidated).
- **Concurrency:** assume a single editor window at a time (Bloom blocks reopening
  while one is open). Revisit if not guaranteed.
- **v2 hooks:** book‑image sharing, pair‑slot UI, and `commit` reattach at the seams
  left above (empty `bookImages`/`references`, no `commit`).
