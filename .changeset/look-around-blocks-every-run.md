---
"bloom-ai-image-tools": patch
---

Look-around mode now blocks every tool run, not only the ones that would spend money at
OpenRouter: "PDF to Images" and "Remove Background", which run entirely in the browser, are
disabled there too, with the same "Not available in look-around mode" reason.
