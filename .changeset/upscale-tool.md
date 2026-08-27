---
"bloom-ai-image-tools": patch
---

New "Upscale" tool under Enhance: it asks the model for the same picture at a higher
resolution, with a Target Resolution selector (Auto, HD, 2K, 4K) whose labels carry the
pixel size each option works out to for the image in hand. "Auto" appears only when the
Bloom host sent a resolution for the image's page slot, and the host's explanation of
that number is shown under the selector. "Remove fuzziness" adds JPEG-artifact removal to
the prompt and starts ticked when the image itself is a JPEG. Real models take only coarse
size tiers, so the request carries the smallest tier at or above the chosen size; the Local
Dummy model reproduces the exact pixels, which is what makes the selector testable. The
"Image to Edit info" panel gains a Format row.
