// The Make-GIF sprite-sheet prompt, single-sourced so the tool registry and
// the offline experiment harness (tests/experiments/gif-animation-experiment.mjs)
// always test the same text. Keep this module dependency-free: the experiment
// bundles it for Node with esbuild, so vite-only imports would break it.

// 12 frames: at 140ms/frame that's a ~1.7s loop, and side-by-side tests
// against 8 frames (tests/experiments/gif-out/iter3-*) showed Gemini keeps
// character consistency across 12 cells while the motion reads noticeably
// smoother. Cost is per image, so more frames are free.
export const DEFAULT_GIF_FRAME_COUNT = 12;

export const GIF_FRAME_COUNT_OPTIONS = [8, 12, 16] as const;

export const parseGifFrameCount = (value: string | undefined): number => {
  const parsed = Number.parseInt((value || "").trim(), 10);
  return (GIF_FRAME_COUNT_OPTIONS as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_GIF_FRAME_COUNT;
};

// Whether the animation should cycle back to its first frame (pleasant on
// endless GIF repeat) or play a one-way action to its end state (where the
// encoder holds the final frame so the restart doesn't strobe).
export type GifEnding = "loop" | "one-way";

export const GIF_ENDING_OPTIONS = [
  "Loops back to the start",
  "Plays once (ends on the final state)",
] as const;

export const DEFAULT_GIF_ENDING_OPTION = GIF_ENDING_OPTIONS[0];

export const parseGifEnding = (value: string | undefined): GifEnding =>
  (value || "").toLowerCase().includes("once") ? "one-way" : "loop";

// The sheet layout AND canvas shape are mandated by the prompt (not inferred
// afterwards), so the slicer can cut the returned sheet at uniform pitch. Each
// supported count maps to an exact grid (no empty cells — a "3 rows of 6"
// request for 16 frames just invites the model to invent its own layout) with
// a canvas shape that keeps cells portrait-ish for standing characters.
const GIF_SHEET_LAYOUTS: Record<number, { rows: number; columns: number; aspectRatio: string }> = {
  8: { rows: 2, columns: 4, aspectRatio: "16:9" },
  12: { rows: 2, columns: 6, aspectRatio: "16:9" },
  16: { rows: 4, columns: 4, aspectRatio: "1:1" },
};

export const getGifSheetLayout = (
  frameCount: number,
): { rows: number; columns: number; aspectRatio: string } => {
  const exact = GIF_SHEET_LAYOUTS[frameCount];
  if (exact) {
    return exact;
  }
  const rows = frameCount <= 5 ? 1 : frameCount <= 12 ? 2 : frameCount <= 21 ? 3 : 4;
  return { rows, columns: Math.ceil(frameCount / rows), aspectRatio: "16:9" };
};

export const getGifSheetAspectRatio = (frameCount: number): string =>
  getGifSheetLayout(frameCount).aspectRatio;

export const buildGifAnimationSheetPrompt = (
  frameCount: number = DEFAULT_GIF_FRAME_COUNT,
  ending: GifEnding = "loop",
  options: {
    /**
     * Ask the generator to draw an explicit magenta (#FF00FF) outline box for
     * each frame and keep all artwork inside it, instead of an invisible
     * grid. The boxes give the model a visible constraint while drawing, give
     * the slicer exact cell positions, and make any overlap failure obvious
     * on the sheet. Experimental — being evaluated against the invisible
     * grid via tests/experiments/gif-animation-experiment.mjs (MAGENTA=1).
     */
    magentaBoxes?: boolean;
  } = {},
): string => {
  const { rows, columns } = getGifSheetLayout(frameCount);
  const layoutText =
    rows === 1
      ? `a single row of ${columns} equal frames`
      : `exactly ${rows} rows of ${columns} equal frames each`;
  const endingText =
    ending === "loop"
      ? `The animation must loop seamlessly: design the motion as a cycle that returns to its starting pose, and make frame ${frameCount} lead smoothly back into frame 1 with no jump. Even for an action with a natural end, choose a repeatable cycle (a sway, a bounce, a repeated gesture) rather than a one-way event.`
      : `Animate the action one way, from start to finish across the ${frameCount} frames, and let the last frame be the natural end state — never reset or undo the action in the final frames.`;
  return `Using the supplied reference image, create a clean animation sprite sheet of ${frameCount} sequential frames for the same main subject, drawn like the in-between frames of a traditional hand-drawn animation. Keep the subject perfectly consistent from frame to frame: identical character design, proportions, colors, outline style, scale, camera angle, and lighting. The camera never moves and the subject never travels: keep the subject centered over the same spot, at the same scale, above the same ground line in every frame, as if it is performing on a single floor tile. Within that spot the body may move as much as the action calls for — stepping, bending, bouncing, swaying, turning — but every step or hop must stay over that spot; never carry the subject across the frame, let it drift, or change its size. Between neighboring frames make small, smooth, lifelike changes, like the in-between frames of real animation; do not change the pose drastically from one frame to the next, but never freeze either — the subject is alive, so its posture, face, and body language shift a little in every single frame, even when only reacting. ${endingText} If no specific action is given, animate a subtle idle loop: gentle breathing, an occasional blink, and a slight shift of weight. Match the reference image's character design, proportions, and colors exactly. ${
    options.magentaBoxes
      ? `First draw ${frameCount} identical rectangular boxes as thin pure magenta (#FF00FF) outlines, arranged in ${layoutText}, evenly spaced, all exactly the same size, with clear white gaps between neighboring boxes and a white margin around the sheet edges. Then draw one frame of the animation centered inside each box, in reading order (left to right, then top to bottom). Every drawn element of a frame must stay completely inside its own magenta box, with clear white space between the artwork and the box lines — nothing may ever touch, cross, or stick out past a magenta line. When a flying or falling object nears a box edge, draw it smaller or farther along its path instead of letting it reach the line. Use pure magenta only for the boxes and never in the artwork itself.`
      : `Lay the ${frameCount} frames out in reading order (left to right, then top to bottom) at the positions of an invisible, strict uniform grid: ${layoutText}, every cell exactly the same size, one frame centered in each cell. The grid must exist only as empty white spacing — never draw the grid itself, and keep every drawn element well inside its own cell so wide white gutters remain between neighboring frames.`
  } The ${frameCount} frames are one single continuous performance in reading order: each frame continues directly from the frame before it, including from the last frame of one row to the first frame of the next row — never restart, rewind, or re-stage the action when a new row begins. If the action involves wind, water, speed, or impact, show it only through its effect on the subject — hair, clothing, and objects reacting — and never as drawn marks in the air. Pure white background everywhere: even if the reference image has scenery, sky, or ground, do not copy any of it — every frame shows the subject alone on plain white. ${
    options.magentaBoxes
      ? "Apart from the magenta boxes themselves: no other borders, boxes, panel edges, or dividing lines, and no"
      : "No borders, no boxes, no panel edges, no dividing lines, no"
  } captions, no text, no frame numbers, no arrows, no motion trails, no speed lines, no wind streaks or swirls, no ground patches, no cast shadows, and no extra scene background. The frames will be cut apart along ${options.magentaBoxes ? "the magenta boxes" : "the uniform grid"} and stacked on top of each other to play as an animation, so every part of the subject that is not moving must be drawn in exactly the same spot within each ${options.magentaBoxes ? "box" : "cell"}.`;
};
