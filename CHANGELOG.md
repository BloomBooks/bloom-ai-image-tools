# bloom-ai-image-tools

## 0.1.14

### Patch Changes

- [`96b14aa`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/96b14aa677d18f0336008f72bcc657509c474cb4) Thanks [@hatton](https://github.com/hatton)! - Inside Bloom, every tool that makes the picture for a book slot now asks for the size
  Bloom says that slot wants. Bloom already told the editor the slot's pixel size, but only
  the Upscale tool listened; Generate Image made a 1024-pixel square for a 1417x945 slot
  unless someone hand-picked a size and shape, and the edit tools followed whatever size
  the source image happened to be.

  The Size picker on Generate Image and Coloring Book has a new first entry, "Auto", showing
  the slot's pixels, and it is the default. With Auto selected the Shape control follows the
  slot too and says so. Picking a size by hand turns Auto off. Outside Bloom there is no
  slot, so Auto stands for the smallest size and the picker looks as it did.

  The edit tools with no size picker (Remove Object, Change Ethnicity, Improve Drawing and
  the rest) follow the slot whenever Bloom supplies one, keeping a shape you set at the
  slot's long edge. Upscale keeps its own Auto option, and the tools that make something
  other than the slot's picture (Break Comic, the cast and game-piece sheets, GIF frames,
  the palette strip) are unchanged.

- [`becf8a1`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/becf8a1feac2544f213bc4759870e076455647aa) Thanks [@hatton](https://github.com/hatton)! - The gallery now says what each image is: the model that made it, what it cost, how long it took,
  the megabytes in and out, and the first line of the prompt, with the whole prompt in a popup on
  hover. Ctrl+mouse-wheel zooms the images themselves, wrapping into more rows as they get smaller,
  instead of zooming the window. Images whose bytes are no longer in storage hold their place with a
  label saying so, rather than collapsing into a broken-image sliver.

  Costs read the same everywhere: to the cent, or to a tenth of a cent when they are under one cent.

- [`39570df`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/39570df3b681c2da19e8692662b726a8ef78c29e) Thanks [@hatton](https://github.com/hatton)! - The reasoning picker for Gemini 3.1 Flash and Flash Lite now offers the two levels
  those models have. Google documents "minimal" and "high" for the 3.1 image models,
  and measured against OpenRouter, "low", "medium" and "high" all bought the same
  amount of thinking while "none" bought what leaving the parameter out buys. The
  picker offered five names for two requests; it now offers "Default" (no thinking)
  and "High". Flash starts at "High", which is what its old "Medium" start was doing.

  A run with more input images than the model takes (14 for the Gemini keys, 16 for
  GPT Image 2.5, counting the image being edited) is now refused before the upload
  with a message saying how many to remove, instead of a 400 from OpenRouter after it.

- [`16a1b85`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/16a1b8512b0143372b2d4053b21f4261aa804b32) Thanks [@hatton](https://github.com/hatton)! - The model picker offers a Quality setting for GPT Image 2.5 (Auto, Low, Medium, High,
  Extra high, Max). It starts at Auto, which is what every request sent before, so nothing
  changes until someone picks. Measured on a 1024x1024 generation, Low returned in 7.7s
  against about 13s at Auto for the same price; how Low looks on book art is for you to
  judge.

  Size options now say what GPT Image 2.5 will actually be sent. That model takes exact
  pixels within a budget (at most 3840 on an edge, at most about 8.3 million pixels), so
  each tier in the size picker shows its pixels underneath ("4k" over "2880x2880" for a
  square), and the Upscale tool's "4K" option reads the size that fits (3520 x 2352 for a
  3:2 image) rather than 4096 on the long edge. Two tiers that come out the same ("512k"
  and "1k" both become 1024) are offered once. The Gemini models, which take the tier names
  as they are, show no pixel line.

  The reasoning picker for Gemini 3 Pro Image no longer offers Medium. Google documents
  Low and High for that model; Medium was accepted but silently turned into one of those.

- [`66ea5dd`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/66ea5ddea1bcd45ffdf47492948cc2fa24a86c4f) Thanks [@hatton](https://github.com/hatton)! - GPT Image 2.5 is the default model, so the prompts and the request parameters now suit it rather
  than Gemini.

  The 2.5 models write captions, labels and signs into pictures nobody asked for. Every tool prompt
  except the two whose job is text now ends by saying not to. Tools that make a surgical edit also
  name what must not change, each in its own words, so "remove the ball" no longer licenses redrawing
  the faces.

  Reasoning levels are declared per model instead of assumed to be the same everywhere. The picker
  offers only the levels a model accepts and disappears for models with no reasoning control, and a
  level remembered from one model is never sent to another that would reject it.

  Output size is requested per model family: a Gemini key takes its tier token, and a GPT Image 2.5
  key takes exact pixels, snapped to what it accepts. An image tool that knows the pixel size it
  wants — the Upscale selector, or a book slot's dimensions — now gets that size instead of one of
  three fixed shapes.

  On the images API, where there is nowhere to put a label beside a picture, the prompt now lists the
  input images by number, saying which is being edited and which are references, and names any
  character a reference shows. Those names were previously dropped.

## 0.1.13

### Patch Changes

- [`c5bc98b`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/c5bc98b38708e4182d3e0fed6347dd3a653ab21c) Thanks [@hatton](https://github.com/hatton)! - Look-around mode now blocks every tool run, not only the ones that would spend money at
  OpenRouter: "PDF to Images" and "Remove Background", which run entirely in the browser, are
  disabled there too, with the same "Not available in look-around mode" reason.

## 0.1.12

### Patch Changes

- [`29ce490`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/29ce490f773b1b0b33acbcf8786517069ee34161) Thanks [@hatton](https://github.com/hatton)! - Say the look-around sentence in exactly one place (`LOOK_AROUND_MODE_MESSAGE`), and use it both
  in the opening notice and where an OpenRouter connection would otherwise be offered, so the two
  cannot drift and there is one string to translate.

## 0.1.11

### Patch Changes

- [`6cbb040`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/6cbb04082710e69a10b01e22e81841eb557fbeb0) Thanks [@hatton](https://github.com/hatton)! - Call the mode "look-around" wherever a user sees it, and say what it would take to leave it:
  the opening dialog now reads "This tool is in "look-around" mode. To actually edit or create
  images, you will need a subscription and a book that is not based on the "Playground"
  template.", and a blocked tool's reason is "Not available in look-around mode".

## 0.1.10

### Patch Changes

- [`9dcbfb9`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/9dcbfb9a70581be652c33b6209e64f8ba8b0c3d7) Thanks [@hatton](https://github.com/hatton)! - Rename `IBloomHostInitPayload.demoOnly` to `playgroundMode`, and tell a playground session
  what it can do. On opening, a dialog says "In the playground mode you can look around but
  you can't yet use the AI image generators."; the offer to connect an OpenRouter account is
  gone, since this session cannot use one. Tools whose run would reach OpenRouter stay
  disabled, with "Not available in playground mode" as the reason. The dev harness flag is
  now `?playground=on`.

## 0.1.9

### Patch Changes

- [`0543937`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/05439376dc491962c3bf42dea8ee07dfe1464d4c) Thanks [@hatton](https://github.com/hatton)! - In a demo session, show the whole editor but refuse the runs that cost money. The model
  lock added in 0.1.8 is gone: `demoOnly` now disables every tool whose run would reach
  OpenRouter (the button says "Not available in this demo"), while the browser-only tools --
  background removal, PDF import -- and everything else in the editor stay usable. The
  invitation to connect to OpenRouter no longer opens on launch in a demo, since there is no
  connection to make. New `toolRunCallsOpenRouter` in `lib/toolHelpers.ts` is the one place
  that decides whether a run would spend anything; the dev harness takes `?demo=on`.

## 0.1.8

### Patch Changes

- [`4141087`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/41410870c5fea633c8ee97799b795d1583eb9cf4) Thanks [@hatton](https://github.com/hatton)! - Honor a host's demo mode as a limit on which model may run, not only on credentials.
  `IBloomHostInitPayload.demoOnly` now means the session is limited to the demo model (the
  free local dummy, which never calls OpenRouter): the hosted shell passes it to the new
  `setDemoModelOnly()`, every tool's model list becomes that model alone whatever the host
  says about developer tools, and `resolveToolModelId` cannot fall back to a paid model.
  Bloom sends `demoOnly` when the collection's subscription does not cover AI image editing
  -- a Playground book opens the editor regardless -- and withholds the OpenRouter key in
  that case, so a paid model has neither an option in the picker nor a key to run on.

- [`52c3522`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/52c3522d99572fa2ec1fe581aaf609b49f39e1fa) Thanks [@hatton](https://github.com/hatton)! - Fix "image_size '4K' is not supported" errors, and stop offering a size the chosen model
  rejects. Each model key has its own `image_config.image_size` ceiling, and the ceiling
  belongs to the dated snapshot the key points at rather than to the model family: measured
  against OpenRouter on 2026-09-01, the stable `google/gemini-3-pro-image` and
  `google/gemini-3.1-flash-image` keys reject 4K that their own `-preview` snapshots accept,
  `google/gemini-3.1-flash-lite-image` takes 1K alone, and `openai/gpt-5.4-image-2` takes 1K
  and 2K. The registry now records a `maxImageSize` per model. The request path reads it and
  reduces an over-large request before it goes out, per candidate key, so a fallback with a
  lower ceiling is handled too. The size selector hides the sizes above the ceiling, and a
  remembered choice that the newly chosen model cannot serve falls back to an offered size.

- [`a73e345`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/a73e345a49edb4b73ae9e9b7a335604bf17b747b) Thanks [@hatton](https://github.com/hatton)! - New "Upscale" tool under Enhance: it asks the model for the same picture at a higher
  resolution, with a Target Resolution selector (Auto, HD, 2K, 4K) whose labels carry the
  pixel size each option works out to for the image in hand. "Auto" appears only when the
  Bloom host sent a resolution for the image's page slot, and the host's explanation of
  that number is shown under the selector. "Remove fuzziness" adds JPEG-artifact removal to
  the prompt and starts ticked when the image itself is a JPEG. Real models take only coarse
  size tiers, so the request carries the smallest tier at or above the chosen size; the Local
  Dummy model reproduces the exact pixels, which is what makes the selector testable. The
  "Image to Edit info" panel gains a Format row.

## 0.1.7

### Patch Changes

- [`fc932fb`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/fc932fbb1dc16be38991c4f360d857ca02833f19) Thanks [@hatton](https://github.com/hatton)! - Make it obvious which book image a run is for. The Local Dummy model now draws the
  target slot's page label ("Page 1 - Image 3") on the image it makes up, as large as
  fits, in a random colour that is always readable on white. The book image the editor
  was launched on gets a border twice as wide as the others, in the brighter accent
  colour, and the strip scrolls that thumbnail into view when the editor opens.

## 0.1.6

### Patch Changes

- [`00d8871`](https://github.com/BloomBooks/bloom-ai-image-tools/commit/00d8871ec063f710d8d47be1c0255e0c1dbf530a) Thanks [@hatton](https://github.com/hatton)! - Open on "Create an Image" when the host launches us on an empty book slot.

  Bloom now offers "Edit with AI..." on an image placeholder (BL-16744), so the slot named by
  `selectedBookImageId` can be one that holds no image. There is nothing to edit there, so the
  editor no longer treats it like an ordinary launch target: the slot's placeholder graphic is
  kept out of the "Image to Edit" panel, and the tool that makes an image from a description is
  opened instead.

  The slot itself is remembered, so a result created in that state carries it. That is what
  makes the result's "Use this Image" button appear and put the new image into the slot the
  user launched on; before, a created image belonged to no slot and the user had to drag it
  onto the strip by hand.

  An empty slot is also marked as holding no image, and the Book Images strip treats it
  accordingly: it is not draggable, it offers no copy or download button, and the target and
  reference panels refuse it even if some other route offers it. It is drawn against white,
  not against the transparency checkerboard, which would say "this picture has transparent
  parts" about a picture that is not there.

  Each slot in the strip now shows the label the host gives it, such as "Page 2 - Image 2".
  Empty slots all show the same graphic, so on a page with two of them the label is the only
  thing that tells the user which slot is which.

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
