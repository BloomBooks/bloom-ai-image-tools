---
"bloom-ai-image-tools": patch
---

The reasoning picker for Gemini 3.1 Flash and Flash Lite now offers the two levels
those models have. Google documents "minimal" and "high" for the 3.1 image models,
and measured against OpenRouter, "low", "medium" and "high" all bought the same
amount of thinking while "none" bought what leaving the parameter out buys. The
picker offered five names for two requests; it now offers "Default" (no thinking)
and "High". Flash starts at "High", which is what its old "Medium" start was doing.

A run with more input images than the model takes (14 for the Gemini keys, 16 for
GPT Image 2.5, counting the image being edited) is now refused before the upload
with a message saying how many to remove, instead of a 400 from OpenRouter after it.
