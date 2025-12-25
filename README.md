# Bloom AI Image Tools

React component library that exposes the `ImageToolsWorkspace` UI for embedding inside other apps. The Vite app in this repo is only a demo shell around the exported component.

## Install & Build

**Prerequisites:** volta, pnpm.

1. Install dependencies: `pnpm install`
2. Run the dev demo: `pnpm dev`
3. Build the npm package: `pnpm build:lib`
4. Build the demo bundle (optional): `pnpm build:demo`

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

## Versioning & Releases

We use [Changesets](https://github.com/changesets/changesets) for semver management. Typical workflow:

1. Create a changeset describing your change: `pnpm changeset`
2. Merge the generated PR. The `Release` GitHub Action will bump versions and publish to npm.
3. Manual publishing (rare): `pnpm release`

Ensure `NPM_TOKEN` is configured in the repo secrets for the workflow to succeed.

## Tests

- E2E (Playwright): set `BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS` to your OpenRouter API key, then run `pnpm e2e`.
