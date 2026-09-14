# What the image models actually charge

Measured against OpenRouter on 2026-09-14, model `openai/gpt-image-2.5-flare`, using
`tests/experiments/reference-cost-experiment.mjs`. Every number below is from a real call's
own `usage` block, not from a price list. Re-run the script to refresh them.

The motivating question: a palette generation costs $0.003, but attaching reference images
takes the same run past $0.04. This is where that goes.

## The rates are as published

- **Input: $8.00 per 1M tokens.** Successive steps in the measurements give 138 tokens →
  $0.001074, 352 → $0.002816, 624 → $0.004992. All exactly $8/1M.
- **Output: $30.00 per 1M tokens.** 75 image tokens × 30e-6 = $0.00225, to the cent.

Nothing is marked up or rounded oddly. The surprise is entirely in how many tokens an image
is worth.

## An input image costs far more than an output image

One run of Generate Pallet at 1232x544, with and without a single 1024px reference:

|               | no reference  | one 1024px reference |
| ------------- | ------------- | -------------------- |
| prompt tokens | 127           | 617                  |
| prompt cost   | $0.000635     | $0.004525            |
| output tokens | 75            | 75                   |
| output cost   | $0.002250     | $0.002250            |
| **total**     | **$0.002885** | **$0.006775**        |

The image the model **drew** is 75 tokens. The image it was **shown** is 490. Six and a half
times more, for a comparable picture, because the two are counted by different mechanisms: the
output is emitted as a compact code, while an input goes through the vision encoder.

## The formula for an input image

The vision encoder cuts the image into 32x32 pixel patches and charges one token per patch,
plus about ten:

```
tokens = ceil(width / 32) * ceil(height / 32) + 10
```

Exact at every size measured:

| reference | patches | predicted | measured |
| --------- | ------- | --------- | -------- |
| 1024x479  | 32 x 15 | 490       | 490      |
| 1088x509  | 34 x 16 | 554       | 554      |
| 1152x539  | 36 x 17 | 622       | 622      |
| 1216x569  | 38 x 18 | 694       | 694      |
| 1280x599  | 40 x 19 | 770       | 770      |
| 1408x659  | 44 x 21 | 934       | 934      |
| 1536x718  | 48 x 23 | 1114      | 1114     |

Shape matters more than the long edge, because patches follow area: a 1024x1024 reference is
1161 tokens against 617 for a 1024x479 one.

### A ceiling

The provider rescales anything over roughly 1536 patches before counting, so a huge reference
is not unbounded. 2048x958 and 4096x1916 both bill 1466 image tokens; 1536x1536 and 2048x2048
both bill 1531. Above ~2048px, sending more pixels costs nothing extra and gains nothing.

### A floor, which is not explained

Below 1024px the charge stops falling. 512x239, 768x359 and 1024x479 all bill the same 490
tokens, where the formula predicts 138 and 298 for the first two. Square behaves the same way:
512x512 and 1024x1024 both bill 1161. A 256x120 reference does drop, to 138.

Something upstream scales small references up before encoding. Measured repeatedly, cause not
determined. This is the reason the cap is 1024 rather than something smaller: below it you give
up detail and save nothing.

## What references cost in practice

Output held at 1024x1536, varying the references attached:

| references | prompt tokens | cost      | vs. no reference |
| ---------- | ------------- | --------- | ---------------- |
| none       | 127           | $0.005375 | —                |
| 1 @ 1024px | 617           | $0.009265 | 1.7x             |
| 1 @ 2048px | 1593          | $0.017073 | 3.2x             |
| 2 @ 1024px | 1107          | $0.018705 | 3.5x             |
| 2 @ 2048px | 3059          | $0.028771 | 5.4x             |
| 3 @ 1024px | 1597          | $0.022595 | 4.2x             |
| 3 @ 2048px | 4525          | $0.040469 | 7.5x             |

References share nothing with each other; each is counted in full, and the tool permits up to 16. Three full-size references is where the "ten times" impression comes from.

Read the prompt-token column, not the cost column, when comparing rows. Two 1024px references
(1107 prompt tokens) total more than one 2048px reference (1593) only because that run drew an
expensive output image — 343 tokens against 158. See the note on output variability below.

The full ladder on the palette's own output size (1232x544), one reference:

| reference long edge | prompt tokens | cost      |
| ------------------- | ------------- | --------- |
| none                | 127           | $0.002885 |
| 256                 | 265           | $0.003959 |
| 512                 | 617           | $0.006775 |
| 768                 | 617           | $0.006775 |
| 1024                | 617           | $0.006775 |
| 1088                | 681           | $0.007287 |
| 1152                | 749           | $0.007831 |
| 1216                | 821           | $0.011467 |
| 1280                | 897           | $0.012075 |
| 1408                | 1061          | $0.010327 |
| 1536                | 1241          | $0.011767 |
| 2048                | 1593          | $0.014583 |
| 4096                | 1593          | $0.014583 |

(Some totals in that column move out of order because output tokens vary; see below.)

## Output size

No reference attached, varying the requested size:

| requested size | output tokens | cost      |
| -------------- | ------------- | --------- |
| 1232x544       | 75            | $0.002885 |
| 1536x1024      | 158           | $0.005375 |
| 1024x1024      | 196           | $0.006515 |
| 2048x1536      | 247           | $0.008045 |
| 3072x2048      | 365           | $0.011585 |

Not monotonic in pixels: 1024x1024 bills 196 tokens while 1536x1024, with 50% more pixels,
bills 158. Square output is disproportionately expensive. Reproduced across repeat runs.

The palette cannot be made cheaper by asking for less. Its 1232x544 is not a choice: the tool
asks for tier 1K at 21:9, which is 1024x439, and `snapToOpenAiImageSize` scales that up to the
model's 655,360-pixel floor. The model will not produce anything smaller.

**Output tokens are not fully deterministic.** The same request at 1232x544 billed 75 tokens on
most runs and 177 on three; at 1024x1536 both 158 and 343 appeared. Every high run had a
reference attached. Worth up to $0.005 of unpredictability per call. Not explained.

## Caching does not apply

Three byte-identical requests seconds apart, 1593 prompt tokens each (over OpenAI's 1024-token
minimum) each reported `cached_tokens: 0` and an identical `upstream_inference_prompt_cost` of
$0.012333. OpenRouter documents prompt caching for OpenAI as automatic, but only for text on
the chat endpoint; nothing covers image inputs or the `/images` endpoint this app uses.

Two things would still limit it if it arrived. Cache reads bill at 0.25x-0.50x, not free. And
caching matches a prefix, while `runToolOnImage` sends `[the image being edited, ...references]`
— the varying part first, the stable part last — so batch runs, the one case where the same
references repeat, would miss anyway.

## What we do about it

References are capped at 1024px on the long edge before being sent
(`MAX_REFERENCE_IMAGE_EDGE` in `lib/imageProcessing.ts`), which is the largest edge that still
bills the least. Against sending 2048px that is 46% off a one-reference call, 35% off two, 44%
off three.

The image being edited is never capped. It is what the result is made from.
