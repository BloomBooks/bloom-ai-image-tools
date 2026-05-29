# Bloom Host Integration Plan

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
