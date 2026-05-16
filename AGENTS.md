## Overview

Bloom AI Image Tools provides a browser-based workspace for creating and editing images with AI. This repository publishes a component library to NPM and has an example App.

## Stack

- Package management: pnpm for installs and scripts (do not use npm)
- App shell: Vite + React + TypeScript, with Material UI theming in `components/materialUITheme.ts`
- Build tooling: tsup for library bundling, Vitest/tsconfig for shared types, and Playwright for end-to-end coverage
- Authentication and API access: OpenRouter OAuth helpers in `lib/openRouterOAuth.ts` and related service files under `services/`

## Common Commands

- Install or refresh dependencies: `vp install`
- Run the app for one-off browser investigation: `vp dev` (serves on `http://localhost:3000` and normally opens the browser)
- Build everything: `vp build`
- Build only the published library output: `vp run build:lib`
- Build only the demo app output: `vp run build:demo`
- Run formatting, linting, and type checking: `vp check`
- Run unit tests: `vp test`
- Preview the built demo: `vp preview`

## E2E Testing with Playwright

- Use `vp run e2e` to run UI tests
- Run specific file: `vp run e2e <file-name>`
- Playwright starts its own dev server with `vp dev --host --port 3000`, so a separate dev server is usually unnecessary
- To see all renderer console messages and failed network requests: set `E2E_VERBOSE=1` before `vp run e2e <file-name>`
- For information on writing tests, see .github/skills/playwright/SKILL.md

## Component Hierarchy

1. **ImageToolsWorkspace** (components/ImageToolsWorkspace.tsx)
   - Root shell that manages authentication, persistence, tool parameters, and OpenRouter orchestration.
   - Supplies hydrated state plus callbacks to the rest of the UI and renders dialogs (settings, model chooser).
2. **ImageToolsPanel** (components/ImageToolsPanel.tsx)
   - Primary layout frame that divides controls vs. canvas.
   - Hosts the tool picker, parameter editors, art style selector, credit status, and history list.
3. **Workspace** (components/Workspace.tsx)
   - Canvas region showing the editable target image, reference grid, and result slot.
   - Composed from repeated **ImagePanel** instances to normalize uploads, drag/drop, and clearing.
4. **Supporting Panels**
   - `HistoryStrip` (and `ImageSlot` thumbnails) keep recent generations accessible for drag-over to the main panels.
   - `CapabilityPanel`, `ToolPanel`, and files under components/tools describe the registry-driven tool controls.
   - `ReferenceImagesPanel`, `ImageInfoPanel`, and `ImageToolsPanel` subcomponents round out auxiliary UI.

## UI

Avoid adding borders around buttons or anything else that are to be placed over images.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Use `vp dev` for live browser investigations and `vp preview` when you specifically need to inspect the built output.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Run `vp build` when you need to validate distributable output, and use `vp run <script>` only for script-specific workflows such as `vp run e2e` or `vp run build:lib`.

<!--VITE PLUS END-->
