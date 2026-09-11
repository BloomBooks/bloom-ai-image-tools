---
"bloom-ai-image-tools": patch
---

GPT Image 2.5 is the default model, so the prompts and the request parameters now suit it rather
than Gemini.

The 2.5 models write captions, labels and signs into pictures nobody asked for. Every tool prompt
except the two whose job is text now ends by saying not to. Tools that make a surgical edit also
name what must not change, each in its own words, so "remove the ball" no longer licenses redrawing
the faces.

Reasoning levels are declared per model instead of assumed to be the same everywhere. The picker
offers only the levels a model accepts and disappears for models with no reasoning control, and a
level remembered from one model is never sent to another that would reject it.

Output size is requested per model family: a Gemini key takes its tier token, and a GPT Image 2.5
key takes exact pixels, snapped to what it accepts. An image tool that knows the pixel size it
wants — the Upscale selector, or a book slot's dimensions — now gets that size instead of one of
three fixed shapes.

On the images API, where there is nowhere to put a label beside a picture, the prompt now lists the
input images by number, saying which is being edited and which are references, and names any
character a reference shows. Those names were previously dropped.
