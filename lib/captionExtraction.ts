/**
 * Collapse the artificial line breaks that come from an image's text layout
 * (a caption wrapped across several lines) into continuous text, while keeping
 * genuine paragraph breaks (separated by a blank line).
 */
export const normalizeCaptionText = (text: string): string =>
  text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/\s*\n\s*/g, " ")
        .replace(/[ \t]{2,}/g, " ")
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 0)
    .join("\n\n")
    .trim();

/**
 * Parse the per-panel captions a generation model returns in its text channel.
 * We ask for a JSON array of strings (one per panel, in grid/reading order);
 * the model sometimes wraps it in ``` fences or adds stray prose, so we locate
 * the first top-level array and parse that. Returns null if no usable array is
 * found, so the caller can decide how to degrade.
 */
export const parseCaptionArray = (channelText: string | null | undefined): string[] | null => {
  if (!channelText || !channelText.trim()) {
    return null;
  }

  const match = channelText.match(/\[[\s\S]*\]/);
  if (!match) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  return parsed.map((entry) => (typeof entry === "string" ? normalizeCaptionText(entry) : ""));
};
