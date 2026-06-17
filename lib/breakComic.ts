// "Break Comic into Images" extracts a multi-frame comic page into individual
// illustrations with their captions.
//
// The image model is asked to EDIT the page in place (remove borders/text/
// background, straighten). Edit-framing preserves the artwork far better than
// describing a new image. Captions come from a separate cheap text call, so
// this works with models that can't return image+text in one turn (e.g. Gemini
// 3.1 Flash). The cleaned sheet is then split locally by connected components.

// Vision model for the text-only caption transcription. Needs reliable
// verbatim OCR; Gemini 3.1 Pro has tested well and a full pass costs about a
// cent.
export const BREAK_COMIC_TEXT_MODEL = "google/gemini-3.1-pro-preview";

// Connected-component merge margin (as a fraction of the sheet's longest side)
// used when splitting the cleaned sheet into panels. Kept deliberately small:
// over-splitting is recoverable (fragments merge back down to the known panel
// count) but two fused panels usually are not. 0.004 is the largest ratio at
// which every comic fixture still resolves to its full panel count — see
// lib/__tests__/comicSplit.test.ts.
export const BREAK_COMIC_MERGE_MARGIN_RATIO = 0.004;

export const BREAK_COMIC_EDIT_PROMPT = `Edit this image by 1) removing the original borders/frames around the comic panels 2) removing the caption text 3) straightening out scenes that are rotated 4) replacing the background behind and between the illustrations with solid white (#FFFFFF). The background must be plain, opaque white — do NOT use transparency, and do NOT draw a checkerboard or any pattern to represent transparency. 5) Then draw a single, thin, solid rectangular border in pure magenta (#FF00FF, RGB 255,0,255) tightly around EACH individual illustration, so that every illustration is fully enclosed inside its own magenta rectangle with a small white margin between the artwork and the magenta line. Use magenta for NOTHING else — only these frame borders. The magenta rectangles must not touch or overlap one another; leave white space between them. Produce exactly ONE output image — a single combined sheet containing all the magenta-framed illustrations on a solid white background. This is an EDIT: apart from the changes listed above, every illustration must remain exactly as it is in the original — same line work, colors, characters, and details.`;

export const BREAK_COMIC_CAPTIONS_PROMPT = `This image is a single page made up of several separate illustrated panels, each with caption text. Return ONLY a JSON array of strings — exactly one per panel, in reading order (left to right, then top to bottom). Each string is that panel's caption text, transcribed verbatim (preserve wording, spelling, and punctuation) with layout line-wraps joined into single spaces. Use an empty string "" for a panel that has no caption. Output nothing else — no commentary and no markdown code fences.`;
