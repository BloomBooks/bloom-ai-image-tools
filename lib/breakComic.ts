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

export const BREAK_COMIC_EDIT_PROMPT = `Edit this image by 1) removing the borders around the comic frames 2) removing the caption text 3) straightening out scenes that are rotated 4) removing the background. Produce exactly ONE output image — a single combined sheet containing all the illustrations, each clearly separated from the others by at least 20px of whitespace . This is an EDIT: apart from the removals and straightening listed above, every illustration must remain exactly as it is in the original — same line work, colors, characters, and details.`;

export const BREAK_COMIC_CAPTIONS_PROMPT = `This image is a single page made up of several separate illustrated panels, each with caption text. Return ONLY a JSON array of strings — exactly one per panel, in reading order (left to right, then top to bottom). Each string is that panel's caption text, transcribed verbatim (preserve wording, spelling, and punctuation) with layout line-wraps joined into single spaces. Use an empty string "" for a panel that has no caption. Output nothing else — no commentary and no markdown code fences.`;
