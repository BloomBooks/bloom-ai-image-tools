# Bloom AI Image Tools

The AI image editor used inside **Bloom Editor**, plus a reusable React component.

This repo produces **two** outputs, and they are consumed in different ways:

| Output                   | Built by           | What it is                                                               | Consumed by                                             |
| ------------------------ | ------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| `dist/` (library)        | `build:lib` (tsup) | The `ImageToolsWorkspace` React component, as an importable npm package. | Any app that wants to `import { ImageToolsWorkspace }`. |
| `dist-app/` (hosted app) | `build:app` (Vite) | The whole standalone editor app (`index.html` + assets).                 | **Bloom Editor**, which loads it in an iframe overlay.  |

Bloom does **not** `import` the React component — it loads the prebuilt `dist-app/` app by URL into an iframe. See [How Bloom hosts this editor](#how-bloom-hosts-this-editor).

## Install & Build

**Prerequisites:** Vite+ (`vp`). On Windows install it with `irm https://vite.plus/ps1 | iex`, then restart your terminal or VS Code so `vp` is on `PATH`.

Vite+ manages the Node.js runtime from `.node-version` and the pnpm version from `packageManager` in `package.json`.

1. Install dependencies: `vp install`
2. Run the dev demo: `vp dev`
3. Build the library: `vp run build:lib` → `dist/`
4. Build the hosted app: `vp run build:app` → `dist-app/` (this is what Bloom ships)
5. Build the demo bundle (optional): `vp build` → `demo-dist/`

## Consuming the Component

> **Not published to npm.** The library build works and is importable from a local
> checkout or via `yarn`/`pnpm link`, but there is no registry release yet, so the
> `pnpm add` below is aspirational. Bloom does not use this path — see
> [How Bloom hosts this editor](#how-bloom-hosts-this-editor).

```bash
pnpm add bloom-ai-image-tools
```

```tsx
import { ImageToolsWorkspace } from "bloom-ai-image-tools";

function Example() {
	return <ImageToolsWorkspace persistence={...} envApiKey={...} />;
}
```

See `App.tsx` for a concrete integration example.

> Art-style preview thumbnails rely on bundlers that support `import.meta.glob`
> (Vite/Rollup). Other bundlers fall back to text-only style selection.

### Localization

Every user-visible string goes through `l10n(id, english)`, the same shape
[bloom-image-gallery](https://github.com/BloomBooks/bloom-image-gallery) uses. A host that
can translate passes `getLocalizations`, which is called once on mount with every string ID
and its English default and returns whatever translations it has; anything missing falls
back to the English. With no `getLocalizations`, the editor is in English.

```tsx
<ImageToolsWorkspace
	persistence={...}
	getLocalizations={(strings) => bloomApi.getLocalizations(strings)}
/>
```

IDs are namespaced `AiImageEditor.*`, except where Bloom already has the string (`Common.Close`,
`EditTab.PasteButton`, …). `ALL_IMAGE_EDITOR_STRINGS` is the whole set, exported for a host that
wants to pre-fetch or inspect it; a tool's or art style's text is keyed by its own id (e.g.
`AiImageEditor.Tool.make_gif.Title`), read from the registry so the English is written once.

After adding or changing an `l10n()` call, run `node dev/generateStaticStrings.mjs` to update
`lib/staticStrings.ts`; `lib/__tests__/staticStrings.test.ts` fails when the two disagree.

Two things stay English on purpose: a select option's stored **value** (it is what the tool's
prompt sends to the model, so only the menu text is translated) and the messages thrown by the
service layer (`services/*`), which have no React context to read a translation from.

## How Bloom hosts this editor

Bloom embeds the editor as an **iframe overlay inside its existing edit-tab WebView2** —
it is not a separate window, and Bloom never bundles this repo's source. The editor app
runs in the iframe and talks to its host over `window.postMessage` (channel
`bloom-ai-image-tools`); file I/O and image bytes go over HTTP to Bloom's local server.
On the Bloom side this lives in `AiImageEditorApi.cs` and `CanvasElementContextControls.tsx`.

The editor decides how it's running from the URL (`App.tsx`): `?mode=bloom-iframe` →
`BloomEmbeddedShell` over `createIframeBloomHostBridge()`; `?mode=bloom-harness` → the
fake-host `BloomHostHarness` (dev/e2e); no mode → the plain `StandaloneShell`. The host
plumbing all hides behind `services/host/BloomHostBridge.ts`.

### Dev loop (today)

Bloom's `GetEditorUrl()` returns `http://localhost:3000/` in a DEBUG build, so the
overlay iframe loads **this repo's running Vite dev server**:

1. `vp dev` here (serves the editor on `http://localhost:3000`).
2. Run a DEBUG build of Bloom and choose "Edit with AI…" on an image. Editor edits
   hot-reload inside Bloom; only Bloom C# changes need a Bloom rebuild.

A Windows junction (`BloomEditor` → the Bloom worktree) is sometimes used to view/edit
both repos in one place; it's git-ignored and not part of the consumption path.

### Production (immutable `dist-v*` git tag)

In a Release build `GetEditorUrl()` returns `{ServerUrl}/bloom/aiImageEditor/index.html`,
i.e. the editor served **same-origin** from Bloom's own server (no CORS).

Bloom gets that build from a **git tag, not npm.** Bloom cannot build this project on
install (it would need Vite+ on the build machine — `prepare` runs `vp config`), so it
consumes a prebuilt `dist-app/`. Each `dist-v*` tag holds `dist-app/` plus a minimal,
script-free `package.json`, so the package manager installs it as static files with no
build step. The tag content is an orphan commit; `master` stays clean. Tags are
**immutable**, and different Bloom branches can pin different editor builds. See the
header comment in `.github/workflows/release.yml`.

To wire that up:

1. **Publish a tag** — see [Versioning & Releases](#versioning--releases). That gives you
   `dist-v<version>`. The app build bakes in `--base=/bloom/aiImageEditor/` so its asset
   URLs resolve at that mount.
2. **Point Bloom at the tag** (`src/BloomBrowserUI/package.json`), pinning the exact ref —
   not a semver range, since the tag _is_ the version:
   ```jsonc
   "bloom-ai-image-tools": "github:BloomBooks/bloom-ai-image-tools#dist-v0.1.2"
   ```
3. **Copy the app into Bloom's served output at build time**, exactly like the existing
   `bp-to-output` step for `bloom-player`, e.g.:
   ```jsonc
   // src/BloomBrowserUI/package.json scripts
   "aiimageeditor-to-output": "cpx \"./node_modules/bloom-ai-image-tools/dist-app/**/*\" ../../output/browser/aiImageEditor -v --clean"
   ```
   During dev you can link this package instead of pinning a tag.

To get a new editor build into Bloom, publish a new tag and bump the pinned ref. Tags
never move, so re-installing against an unchanged ref can never change what Bloom gets.

## Versioning & Releases

**Releasing is on demand — nothing publishes when you merge.** Push your work to `master`,
then run the `Release` workflow (Actions -> Release -> Run workflow) and pick `patch`,
`minor` or `major`. One click does the whole thing:

1. bumps the version in `package.json` and commits that to `master`
2. builds `dist-app/`
3. publishes the immutable tag `dist-v<new version>`
4. writes a GitHub Release whose notes are the commit subjects since the last release

The run's summary prints the exact line to paste into Bloom. Publishing is **refused if
`dist-v<version>` already exists** — tags are immutable, so choose a larger bump or pass an
exact `version` input.

Then point Bloom at the new tag — step 2 of
[Production](#production-immutable-dist-v-git-tag).

**npm:** this package is not on the registry and Bloom does not import it as a library —
Bloom loads `dist-app/` as static files in an iframe. Nothing publishes to npm.

## Tests

- Unit tests: `vp test`
- E2E (Playwright): set `BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS` to your OpenRouter API key, then run `vp run e2e`.
