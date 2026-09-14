---
"bloom-ai-image-tools": patch
---

Inside Bloom, a freshly generated or uploaded image no longer stays in memory as base64
for the rest of the session. As soon as the editor has saved its bytes to the book's
history folder, the image is referenced by the URL Bloom serves that file from, the same
way images from earlier sessions already are. A batch run across a whole book therefore no
longer accumulates every result inline. Committing such an image to the book is unchanged.

Dragging an image now lifts it slightly on hover and shows a grab cursor, closing to a
fist while it is held, so that every image reads as something you can pick up. The
control-click multi-preview mode is gone; the gallery opens inset from the tool's edges so
its close button no longer sits next to Bloom's own. Improve Drawing keeps the original's
colors and stays a line drawing.
