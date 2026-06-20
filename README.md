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
3. Build the npm package: `vp run build:lib`
4. Build the demo bundle (optional): `vp build`

## Consuming the Component

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

### Production (npm, mirrors how Bloom consumes `bloom-player`)

In a Release build `GetEditorUrl()` returns `{ServerUrl}/bloom/aiImageEditor/index.html`,
i.e. the editor served **same-origin** from Bloom's own server (no CORS). To wire that up:

1. **Publish this package** (ships `dist-app/` — see `files` in `package.json`). The app
   build bakes in `--base=/bloom/aiImageEditor/` so its asset URLs resolve at that mount.
2. **Add the dependency in Bloom** (`src/BloomBrowserUI/package.json`):
   `"bloom-ai-image-tools": "^x.y.z"`.
3. **Copy the app into Bloom's served output at build time**, exactly like the existing
   `bp-to-output` step for `bloom-player`, e.g.:
   ```jsonc
   // src/BloomBrowserUI/package.json scripts
   "aiimageeditor-to-output": "cpx \"./node_modules/bloom-ai-image-tools/dist-app/**/*\" ../../output/browser/aiImageEditor -v --clean"
   ```
   During dev you can `yarn link` this package instead of installing a published version.

> Not done yet: steps 2–3 wait until the first npm publish (a `package.json` range
> pointing at an unpublished version would break Bloom's install). The editor side
> (step 1) is ready.

## Versioning & Releases

We use [Changesets](https://github.com/changesets/changesets) for semver management. Typical workflow:

1. Create a changeset describing your change: `vp run changeset`
2. Merge the generated PR. The `Release` GitHub Action will bump versions and publish to npm.
3. Manual publishing (rare): `vp run release`

Ensure `NPM_TOKEN` is configured in the repo secrets for the workflow to succeed.

## Tests

- Unit tests: `vp test`
- E2E (Playwright): set `BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS` to your OpenRouter API key, then run `vp run e2e`.
