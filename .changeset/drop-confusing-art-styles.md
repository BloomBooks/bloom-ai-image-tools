---
"bloom-ai-image-tools": patch
---

Drop two art styles that users could not tell apart from their neighbors.

"Vector Illustration Outlines" promised vector output, so people expected an SVG, but the
tool only ever produces a raster PNG. Its prompt also asked for the same thing as "Clear
Line & Flat Color" -- clean black outlines over flat colors -- so there was no way to
predict which of the two cards would give which result. "Clear Line & Flat Color" stays.

"Paper Cut Collage" and "Paper Cutout & Collage" differed by one word in their names and
said the same things in their descriptions, even though their prompts asked for two
different paper surfaces (smooth construction paper against painted, textured paper).
"Paper Cutout & Collage" stays, because the painted-paper look it asks for is not offered
anywhere else in the list.
