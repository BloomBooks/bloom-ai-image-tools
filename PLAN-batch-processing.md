# Batch Processing Plan — apply one tool to many book images

Status: implemented (WP1–WP7) on branch `batch-processing`, 2026-08-01. Kept as the
design record; the "Agreed UX" and "Execution model" sections below reflect what shipped.
Tracker: deliberately not on YouTrack (John's call, 2026-08-01).

## Goal

When editing a Bloom book (hosted mode), let the user tick several Incoming Book Images
and run the current tool once over all of them — e.g. "Enhance Line Drawing" with extra
instruction "remove the background" across 18 images. Results land in the replacement
slots automatically; the user inspects as they arrive, can cancel mid-run, and commits
everything at the end with the existing **Replace** (commit-all) button.

## Agreed UX

- **Eligibility.** A tool supports batch when it takes a target image and produces a
  single image result. Declared per tool via a new `allowBatch: true` flag in
  `components/tools/tools-registry.ts`. Roughly: every tool with a visible "Image to
  Edit" box EXCEPT multi-output tools (`break_comic`, GIF/`derivedResultMode` tools,
  the split/extract tools).
- **Selection.** When the active tool has `allowBatch`, a checkbox appears above each
  Incoming Book Image in the strip. Not tickable when: the slot already has an assigned
  replacement, or the image `isPlaceholder`. Provide a "select all" affordance.
- **Button morph.** With ≥1 box ticked the tool's action button reads
  "Apply Changes to N Images" and shows an estimated cost (per-image price from
  `data/models-registry.json5` × N). Any tick means batch semantics, even N=1 — one
  code path, button text always truthful.
- **Image to Edit box.** With ≥1 tick it stops showing an image and reads
  "Will edit the N selected images". Clearing all ticks restores the previously
  loaded target.
- **Clicking book images during batch context.** With ≥1 tick, or while a batch is
  running, clicking a book-strip item no longer retargets the Image to Edit box
  (that box is showing the placeholder text anyway). Instead it **inspects**: the
  clicked item's current state (assigned result if one exists, else the original)
  appears in the right-hand result panel. With no ticks and no batch running, clicking
  behaves exactly as today.
- **Right panel = inspector during a run.** By default it follows the latest completed
  result (each finished image replaces the view). A click on any strip item pins that
  image; while pinned, a small "Follow latest" chip/button un-pins. The panel is fully
  decoupled from progress display.
- **Progress.** The right-panel loading overlay is NOT used for batch. Instead a slim
  determinate linear progress bar ("Processing image 5 of 18") with a **Cancel** button
  sits with the tool's action button (the button area morphs into it while running).
  The strip slot currently being processed gets a spinner overlay; completed slots fill
  with their result; failed slots get an error badge.
- **Cancel.** Aborts the in-flight request, keeps every already-assigned result,
  leaves unprocessed images ticked. Because processing is sequential, cancel is also
  the "try one, then unleash" gate — watch result #1, cancel if the prompt is wrong.
- **Failures.** One image failing (e.g. "no image returned" after the service's 3
  attempts) must not halt the run: skip it, badge its slot, continue, and summarize at
  the end ("16 of 18 succeeded, 2 failed"). Failed images stay ticked/tickable, so
  pressing the button again retries exactly the stragglers.
- **Commit.** Unchanged: the user reviews slots and presses the existing Replace
  button (`handleCommitAll` → one `bridge.commit(replacements[])`). Batch itself never
  commits, so the `onCommitComplete` → close-editor behavior in `App.tsx:121` is fine.

## Execution model

- **Worker pool, concurrency 4** (WP7; hardcoded `BATCH_CONCURRENCY` in
  `lib/batchPool.ts` — deliberately not a user setting). Up to 4 images in
  flight; when one settles the next ticked image starts, in book-strip order.
  ~15–30s/image ⇒ ~2–3 min for 18.
- **Rate limits**: a 429 (`OpenRouterApiError` reason `"rate-limited"`) retries
  the same image with 5s/15s/30s backoff (max 3 retries), and the first 429 in
  a run drops the pool to concurrency 1 for the remainder. Logic lives in the
  pure helper `runBatchPool` (`lib/batchPool.ts`, unit-tested); the OpenRouter
  service's error mapping is unchanged.
- **Cancel** aborts every in-flight request (they share one AbortController)
  and any backoff wait; aborted images count as cancelled (still ticked), not
  failed. Completed assignments are kept.
- The Local Dummy model has a ~1s default delay (`DEFAULT_DUMMY_DELAY_MS`) so
  parallelism is visible; `window.__bloomDummyDelayMs` overrides (0 = instant),
  and `__bloomDummyFailOnCallNumber` / `__bloomDummyRateLimitOnCallNumbers` /
  `__bloomBatchRetryDelaysMsOverride` let e2e exercise failure, 429, and
  backoff paths deterministically.
- Per-image parameters resolve per source: AUTO aspect ratio already derives from each
  image's resolution (`components/tools/toolHelpers.ts:43-61`). Prompt, style, extra
  instructions, reference images are shared across the batch.
- Each result: post-process via `applyPostProcessingPipeline`, create a history record
  (`createHistoryItem`) carrying `incomingSlotId`, then assign to the replacement slot
  (`handleAssignReplacement` path).
- Costs: record per-image measured cost as today (`measuredStatsByKey`).

## Work packages

Each WP = one subagent task, reviewed and approved before the next starts.
After every WP: `vp check` and `vp test` must pass; e2e (`vp run e2e`) for WPs that
change behavior. Use the Local Dummy model (`lib/localModels.ts`,
`LOCAL_DUMMY_MODEL_ID`, localhost-only) + `?mode=bloom-harness` for all manual/e2e
verification — zero API spend.

### WP1 — Extract a reusable single-image runner (refactor only; highest risk)

`ImageToolsWorkspace.handleApplyTool` (`components/ImageToolsWorkspace.tsx:2074`,
~750 lines) reads `state.targetImageId`, the single `isProcessing` boolean, and the
single `requestAbortControllerRef` from component state. Extract the core into
`runToolOnImage(args)` that takes: tool, resolved model, source image (id + data URL),
parameter payload, reference images, an `AbortSignal`, and progress callbacks; returns
the processed result (image + cost + duration + credits) or throws. `handleApplyTool`
becomes a thin wrapper preserving today's behavior exactly.

Constraints for the subagent:

- No behavior change whatsoever. No UI change. Multi-phase tools (break_comic, GIF,
  splits) may remain inside the wrapper if extracting them is messy — batch never
  calls them.
- Don't touch `openRouterService.ts`.
- Acceptance: `vp check`, `vp test`, full e2e suite green; a manual dummy-model run of
  enhance_drawing and break_comic in the harness behaves as before.

### WP2 — Registry flag + eligibility

Add `allowBatch?: boolean` to the tool type; set it on the qualifying tools
(enhance_drawing and the other single-in/single-out edit tools; explicitly NOT
break_comic, GIF, split/extract). Expose a helper `toolSupportsBatch(tool)`.
Acceptance: unit test enumerating the registry and asserting the expected set.

### WP3 — Selection UI + button/edit-box morph

Checkbox overlay on book-strip items (only when active tool `allowBatch` and hosted
strip mode), tick rules (no assigned replacement, no placeholder), select-all,
tick state in workspace state. Button text "Apply Changes to N Images" + cost
estimate; Image-to-Edit placeholder "The selected N images"; clearing ticks restores
prior target. Respect AGENTS.md UI rule: no borders on controls placed over images.
Acceptance: e2e in harness mode covering tick rules and morphing (no AI calls needed).

### WP4 — Batch runner

Sequential loop over ticked images calling `runToolOnImage`; one batch-level
AbortController; per-image try/catch with failure badges; auto-assign successes to
replacement slots + history records; end-of-run summary; re-run retries only
still-ticked images. Batch state (`batchRun: { total, completed, failed[],
currentImageId } | null`) in workspace state.
Acceptance: e2e with dummy model — happy path (3 images), cancel after first,
injected failure isolation (add a dummy-model hook to force one failure if none
exists).

### WP5 — Progress bar + inspector panel behavior

Linear determinate progress ("Processing image i of N") with Cancel, replacing the
action button while running; spinner overlay on the active strip slot; right-panel
inspector: follow-latest default, click-to-pin, "Follow latest" un-pin chip; click
semantics per Agreed UX. The existing `ImageSlotLoadingOverlay` right-panel overlay
must not appear during batch runs.
Acceptance: e2e — results viewable mid-run, pin/unpin, cancel via the bar.

### WP6 — Polish + docs

README/AGENTS notes if needed, cost-estimate copy, summary toast/message wording,
run the full e2e suite, sweep for leftover TODOs.

## Review gates (orchestrator, not subagents)

After each WP: read the full diff, run checks locally, exercise the harness with the
dummy model, then approve or bounce with specific feedback. WP1 gets the strictest
review (pure-refactor diff, look for accidental state reads). No commits or pushes
except when the user authorizes or a skill workflow (preflight) is invoked.
