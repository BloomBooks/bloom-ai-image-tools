## Overview

Bloom AI Image Tools provides a browser-based workspace for creating and editing images with AI. This repository publishes a component library to NPM and has an example App.

## Stack

- Package management: pnpm for installs and scripts (do not use npm)
- App shell: Vite + React + TypeScript, with Material UI theming in `components/materialUITheme.ts`
- Build tooling: tsup for library bundling, Vitest/tsconfig for shared types, and Playwright for end-to-end coverage
- Authentication and API access: OpenRouter OAuth helpers in `lib/openRouterOAuth.ts` and related service files under `services/`

## E2E Testing with Playwright

- Use `pnpm run e2e` to run UI tests
- Run specific file: `pnpm run e2e <file-name>`
- To see all renderer console messages and failed network requests: `E2E_VERBOSE=1 pnpm run e2e <file-name>`
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
   - `HistoryStrip`/`HistoryCard` keep recent generations accessible for drag-over to the main panels.
   - `CapabilityPanel`, `ToolPanel`, and files under components/tools describe the registry-driven tool controls.
   - `ReferenceImagesPanel`, `ImageInfoPanel`, and `ImageToolsPanel` subcomponents round out auxiliary UI.
