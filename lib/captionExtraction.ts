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

// Matches a caption that opens with a panel number, e.g. "1. ", "2) ", "10. ".
const PANEL_NUMBER_PREFIX = /^\s*(\d+)\s*[.)]\s/;

/**
 * The panel number a caption opens with ("1." → 1, "10)" → 10), or null when it
 * isn't numbered. Used to order split pieces by message number rather than by
 * their physical position on the page, which can differ (e.g. panel 10 laid out
 * before 8 and 9).
 */
export const captionLeadingNumber = (caption: string | null | undefined): number | null => {
  if (!caption) {
    return null;
  }
  const match = caption.match(/^\s*(\d+)\s*[.)]/);
  return match ? Number.parseInt(match[1], 10) : null;
};

/**
 * Drop a leading page title/preamble from a numbered caption list. Comic pages
 * often carry a heading ("Coughs, colds and pneumonia — 10 messages…") that the
 * transcriber returns as the first array entry, ahead of the numbered panel
 * captions. Left in, it shifts every caption onto the wrong panel and inflates
 * the panel count by one. The numbered list marks where the real panels start:
 * if a "1." entry exists with only non-numbered entries before it, those leading
 * entries are the title and are removed. When no such pattern is present (e.g. a
 * page whose panels aren't numbered) the list is returned unchanged, so this is
 * safe to apply unconditionally.
 */
export const stripLeadingTitle = (captions: string[]): string[] => {
  if (captions.length < 2) {
    return captions;
  }

  const firstPanelIndex = captions.findIndex((caption) => {
    const match = caption.match(PANEL_NUMBER_PREFIX);
    return match ? match[1] === "1" : false;
  });

  // No "1." entry, or it is already first — nothing to strip.
  if (firstPanelIndex <= 0) {
    return captions;
  }

  // Only strip when everything before "1." is unnumbered preamble; if a numbered
  // entry sits ahead of "1." the list is out of order, not titled, so leave it.
  const preambleIsAllUnnumbered = captions
    .slice(0, firstPanelIndex)
    .every((caption) => !PANEL_NUMBER_PREFIX.test(caption));

  return preambleIsAllUnnumbered ? captions.slice(firstPanelIndex) : captions;
};
