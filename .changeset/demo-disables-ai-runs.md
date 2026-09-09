---
"bloom-ai-image-tools": patch
---

In a demo session, show the whole editor but refuse the runs that cost money. The model
lock added in 0.1.8 is gone: `demoOnly` now disables every tool whose run would reach
OpenRouter (the button says "Not available in this demo"), while the browser-only tools --
background removal, PDF import -- and everything else in the editor stay usable. The
invitation to connect to OpenRouter no longer opens on launch in a demo, since there is no
connection to make. New `toolRunCallsOpenRouter` in `lib/toolHelpers.ts` is the one place
that decides whether a run would spend anything; the dev harness takes `?demo=on`.
