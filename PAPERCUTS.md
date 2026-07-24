Papercuts for bloom-ai-image-tools — small dev/agent/tooling friction points, captured now and
fixed later. See the "papercut" skill for the procedure.

Note: when resolving a git merge conflict here, keep both sides' entries unless they merge cleanly.

---

## 2026-07-23 — Playwright e2e suite has pre-existing failures on clean master

- **Cut:** 8 e2e tests fail on a clean master checkout (break-comic-watch, extract-cast-debug, history-store migration, persistence ×2, reconnect-folder-button, reference-images-ui ×2), so a feature branch can't use "suite is green" as its gate — every failure has to be manually baselined against a stash to prove it's pre-existing. The bloom-host-harness spec was also stale (3 tests asserting the old always-rendered Replace button and old Result-pane rehydration) until fixed on the credits branch.
- **Idea:** triage the 8 failures: fix the stale ones, and consider a CI job (or at least a documented `pnpm e2e` gate) so specs get updated in the same PR as the UI changes that break them.
- **Context:** found while verifying the image-credits vertical, 2026-07-23; failure list reproducible with `npx playwright test --workers=2` on master.
