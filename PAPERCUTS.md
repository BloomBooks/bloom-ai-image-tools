Papercuts for bloom-ai-image-tools — small dev/agent/tooling friction points, captured now and
fixed later. See the "papercut" skill for the procedure.

Note: when resolving a git merge conflict here, keep both sides' entries unless they merge cleanly.

---

## 2026-07-23 — Playwright e2e suite has pre-existing failures on clean master

- **Cut:** 8 e2e tests fail on a clean master checkout (break-comic-watch, extract-cast-debug, history-store migration, persistence ×2, reconnect-folder-button, reference-images-ui ×2), so a feature branch can't use "suite is green" as its gate — every failure has to be manually baselined against a stash to prove it's pre-existing. The bloom-host-harness spec was also stale (3 tests asserting the old always-rendered Replace button and old Result-pane rehydration) until fixed on the credits branch.
- **Idea:** triage the 8 failures: fix the stale ones, and consider a CI job (or at least a documented `pnpm e2e` gate) so specs get updated in the same PR as the UI changes that break them.
- **Context:** found while verifying the image-credits vertical, 2026-07-23; failure list reproducible with `npx playwright test --workers=2` on master.

## 2026-08-01 — e2e baseline has grown to 17 failing tests; harness page never reaches document_idle

- **Cut:** the pre-existing e2e breakage (entry above) is now 17 failed / 26 passed on a clean master baseline (`vp run e2e`), mostly `openrouter-api-key-input` stuck disabled plus a harness beacon that never appears. Every WP of the batch-processing work has to stash-baseline the identical failure list to prove innocence. Related symptom when live-driving `?mode=bloom-harness` with browser automation: the page never reaches document_idle, so screenshot/read_page injection times out and only direct JS evaluation works.
- **Idea:** same as above, with more urgency — triage the api-key-input-disabled cluster first; find what keeps the harness page from going idle (likely the same beacon) since it also blocks automation tooling.
- **Context:** found while reviewing WP1 of PLAN-batch-processing.md on branch batch-processing, 2026-08-01.

## 2026-08-01 — batch-run.spec is timing-flaky under default parallel workers

- **Cut:** `npx playwright test tests/batch-run.spec.ts` at the default worker count fails 3–5 of 7 tests nondeterministically (different set each run); the same file passes 7/7 with `--workers=1`. The specs pace themselves with `__bloomDummyDelayMs` (800–3000 ms) against 2 s action / 5 s expect timeouts, and `fullyParallel: true` + headed browsers pushes real completions past those windows under load.
- **Idea:** either serialize this file (`test.describe.configure({ mode: "serial" })` or a project-level `workers: 1` for the dummy-delay specs) or widen the tight expect timeouts where a dummy delay is in play.
- **Context:** found while fixing the missing-original-in-history bug on branch batch-processing, 2026-08-01; wasted several runs distinguishing real regressions from load flakes.

## 2026-08-25 — bloom-host-harness.spec fails 10/10 at the default worker count

- **Cut:** `npx playwright test tests/bloom-host-harness.spec.ts` starts 10 workers against the one dev server and every test times out in `beforeEach` (`page.goto` never settles), so the file reads as totally broken. The same file passes 10/10 with `--workers=2`, and any single test passes on its own. Same class as the batch-run entry above, but this one fails _all_ of them, which looks like a real regression rather than flake.
- **Idea:** cap workers for the specs that share the harness dev server (project-level `workers`, or `test.describe.configure({ mode: "serial" })`), so a plain run of the file is trustworthy.
- **Context:** found while verifying the empty-slot work (BL-16744) before publishing a dist tag, 2026-08-25.

## 2026-09-14 — `npx vitest run` half-works here and looks like 12 broken test files

- **Cut:** this repo's tests run under vite-plus (`vp test`), but `npx vitest run` also starts and produces a plausible-looking result: `12 failed | 12 passed (24)` test files, with every failure `TypeError: Cannot read properties of undefined (reading 'config')` thrown from `@voidzero-dev/vite-plus-test` during collection. It reads as a broken suite, and it survives a stash-baseline (a clean tree fails identically), so the usual innocence check confirms the wrong conclusion. It also collects only 147 of the 277 tests. `npx vp test run` passes 24/24 files, 277/277 tests.
- **Idea:** say in AGENTS.md/CLAUDE.md that the test command is `vp test` and that plain `vitest` is not a valid substitute here; a root `vitest.config.ts` that throws a clear "use vp test" error would make it self-diagnosing.
- **Context:** hit while changing the enhance-drawing prompt and the gallery dialog, 2026-09-14; cost a wrong report that the suite was red on master.

## 2026-09-14 — a Playwright measurement of the history strip lies three ways before it works

- **Cut:** writing `tests/history-scale.spec.ts` (seed N history images, measure the strip and a drag) hit three traps, each of which produced confident-looking numbers rather than an error. (1) `window.seedHistory` races the `deleteDatabase` in `resetImageToolsPersistence`, so a single seed regularly lands on an empty strip — `tests/drag-stall-isolate.spec.ts` already carries a retry loop for exactly this. (2) Counting thumbs with `querySelectorAll` counts hidden nodes, so a tab click that landed before React attached its handler measured a fully-populated strip that was never on screen, and reported drag timings of zero as if the drag had been free. (3) `test.use({ headless: true })` inside a `describe` is a hard error ("forces a new worker") and has to sit at file top level, which matters because the repo config is `headless: false` and an unattended run must not open windows.
- **Idea:** give the seed helper a `seedHistoryAndWait(page, count)` in `playwright_helpers.ts` that does the retry, waits for `[data-testid="thumbnail-strip-history"][data-active="true"]`, and returns the visible thumb count — all three of these are one helper's worth of knowledge that every new perf spec currently rediscovers.
- **Context:** found while measuring where the drag-start delay comes from, 2026-09-14.
