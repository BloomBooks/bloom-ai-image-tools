# bloom-ai-image-tools

## 0.1.5

### Patch Changes

- [`d6bc4ef`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/d6bc4efae4a79b8bca5f35d4453e14f4ad2a1334) Thanks [@hatton](https://github.com/hatton)! - Drop two art styles that users could not tell apart from their neighbors.

  "Vector Illustration Outlines" promised vector output, so people expected an SVG, but the
  tool only ever produces a raster PNG. Its prompt also asked for the same thing as "Clear
  Line & Flat Color" -- clean black outlines over flat colors -- so there was no way to
  predict which of the two cards would give which result. "Clear Line & Flat Color" stays.

  "Paper Cut Collage" and "Paper Cutout & Collage" differed by one word in their names and
  said the same things in their descriptions, even though their prompts asked for two
  different paper surfaces (smooth construction paper against painted, textured paper).
  "Paper Cutout & Collage" stays, because the painted-paper look it asks for is not offered
  anywhere else in the list.

## 0.1.4

### Patch Changes

- Report each generation to the host, so Bloom can see what the AI editor costs and whether it works

  The editor now hands an analytics event to whatever host it is running in, via
  `IBloomHostControl.trackEvent`, for each tool run: which tool and model, whether the result came
  from a local run or a paid API call, whether credits were spent, how long it took, the outcome, and
  which attempt it was. Bloom is the party that actually sends anything anywhere, and it accepts only
  known events carrying known properties -- prompt text is deliberately not among them.

  The reporting is isolated from the work it observes: a host whose analytics callback throws or
  rejects can no longer fail a generation the user has already paid for. Failed and never-sent
  generations are kept out of the cost figures rather than skewing them.

## 0.1.3

### Patch Changes

- [`a4eb1a4`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/a4eb1a4841fcc69354dc92469b46c8ce674eeee5) Thanks [@hatton](https://github.com/hatton)! - Keep the "Connect to AI Image Generators" and "Connect history folder" buttons visible on hover. They swapped to `accentHover`, which is darker than the app background, so the pill dissolved into the page and left the label floating. They now dim the accent instead, matching the identically-labelled CTA in the OpenRouter welcome dialog.

## 0.1.2

### Patch Changes

- [#1](https://github.com/BloomBooks/bloom-ai-image-tools/pull/1) [`01d3c34`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/01d3c34854c35122e9996a846fb6a6300159570d) Thanks [@andrew-polk](https://github.com/andrew-polk)! - Fix the label color on the filled accent buttons ("Connect to AI Image Generators" and "Connect history folder"), whose text was drawn in the near-black panel color and disappeared on hover.
