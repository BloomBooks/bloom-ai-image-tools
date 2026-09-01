---
"bloom-ai-image-tools": patch
---

Fix "image_size '4K' is not supported" errors, and stop offering a size the chosen model
rejects. Each model key has its own `image_config.image_size` ceiling, and the ceiling
belongs to the dated snapshot the key points at rather than to the model family: measured
against OpenRouter on 2026-09-01, the stable `google/gemini-3-pro-image` and
`google/gemini-3.1-flash-image` keys reject 4K that their own `-preview` snapshots accept,
`google/gemini-3.1-flash-lite-image` takes 1K alone, and `openai/gpt-5.4-image-2` takes 1K
and 2K. The registry now records a `maxImageSize` per model. The request path reads it and
reduces an over-large request before it goes out, per candidate key, so a fallback with a
lower ceiling is handled too. The size selector hides the sizes above the ceiling, and a
remembered choice that the newly chosen model cannot serve falls back to an offered size.
