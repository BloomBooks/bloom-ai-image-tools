import {
  GenerationTimingState,
  ImageRecord,
  ModelInfo,
  ModelReasoningLevel,
  ToolDefinition,
} from "../types";
import {
  editImage,
  generateText,
  ImageConfig,
  type EditImageOptions,
} from "../services/openRouterService";
import { BREAK_COMIC_CAPTIONS_PROMPT, BREAK_COMIC_TEXT_MODEL } from "./breakComic";
import { canUseLocalDummyModelWithoutApiKey } from "./localModels";
import { resolveToolReasoningLevel } from "./modelsCatalog";
import { removeBackgroundFromImage } from "./backgroundRemoval";
import { applyPostProcessingPipeline } from "./postProcessing";
import {
  AUTO_ASPECT_RATIO,
  getAspectRatioPromptHint,
  resolveAspectRatioValue,
} from "./aspectRatios";
import { ensureDataUrl, getImageDimensions } from "./imageUtils";
import { pickSizeTokenForLongEdge } from "./imageSizes";
import {
  findTargetResolutionParam,
  formatUpscaleDimensions,
  RESOLVED_TARGET_PIXELS_PARAM,
  resolveUpscaleTarget,
  type UpscaleHostTarget,
} from "./upscale";
import { getGifSheetAspectRatio, parseGifFrameCount } from "./gifAnimationPrompt";
import { getRequestedAspectRatioValue } from "./toolHelpers";
import {
  createPromptDurationKey,
  createToolDurationKey,
  resolveEstimatedDurationMs,
} from "./generationTiming";

/** Thrown when a tool needs OpenRouter but no usable API key is available. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("Connect to OpenRouter before running tools.");
    this.name = "MissingApiKeyError";
  }
}

export interface RunToolOnImageArgs {
  tool: ToolDefinition;
  toolModel: ModelInfo | null | undefined;
  requiresEditImage: boolean;
  /** The image being edited, or null for tools that don't require one (editImage: false). */
  targetImage: ImageRecord | null;
  /**
   * Page label of the book image slot this run is for ("Page 1 - Image 3"),
   * when there is one. Passed straight to editImage, where only the Local
   * Dummy model uses it (see EditImageOptions.targetSlotPageLabel).
   */
  targetSlotPageLabel?: string | null;
  /**
   * The resolution the host says the target image's book slot wants, which is
   * the Upscale tool's "Auto" option (see IBloomHostBookImage.suggestedTarget).
   * Per-image, so the batch runner must pass each image's own.
   */
  hostSuggestedTarget?: UpscaleHostTarget | null;
  params: Record<string, string>;
  /** Reference images already limited to the tool's reference-count cap. */
  constrainedReferences: ImageRecord[];
  reasoningByTool: Record<string, ModelReasoningLevel>;
  generationTiming: GenerationTimingState;
  /** OpenRouter key to use for network calls; unused for local-only tools (remove_background). */
  resolvedApiKey: string | undefined;
  /**
   * True in E2E, where an env-provided key means the model id should come from
   * the dev server's env rather than the UI's per-tool model selection.
   */
  useEnvDefaultModelId: boolean;
  signal: AbortSignal;
  /** Called once, right before the network/local call starts, with the progress-bar estimate. */
  onProgressStart: (estimatedDurationMs: number) => void;
  /** Called to advance the loading overlay's phase label; a no-op for single-phase tools. */
  onPhase: (index: number) => void;
}

export interface RunToolOnImageResult {
  processedImageData: string;
  /**
   * All images the generation returned (post-processed), in order. Usually
   * length 1, but interleaved image models can return several (e.g. one per
   * comic panel). processedImageData === processedImages[0].
   */
  processedImages: string[];
  durationMs: number;
  cost: number;
  model: string;
  generationText: string | null;
  reasoningLevelForRequest: ModelReasoningLevel | null;
  prompt: string;
  promptDurationKey: string;
  toolDurationKey: string;
  requestedSize: string | undefined;
  /** The target image's resolution as used for this request (for the caller's resolution cache). */
  targetImageResolution: { width: number; height: number } | undefined;
  /** performance.now()-style timestamp captured right before the call started. */
  progressStartedAt: number;
  /** True when the request spent real OpenRouter credits and the balance should be refetched. */
  shouldRefreshCredits: boolean;
}

/**
 * Runs one tool against one source image: builds the prompt, calls either
 * local background removal or the OpenRouter edit-image endpoint, and
 * post-processes the result. This is the single-image core shared by every
 * tool application; multi-phase/derived-output handling (break-comic's
 * caption call aside, which stays here since it's part of the same
 * generation phase; splitting a sheet into pieces, GIF encoding, history/strip
 * updates) stays with the caller.
 *
 * Reads nothing from workspace component state — everything comes in via
 * `args` or is returned for the caller to act on.
 */
export async function runToolOnImage(args: RunToolOnImageArgs): Promise<RunToolOnImageResult> {
  const {
    tool,
    toolModel,
    requiresEditImage,
    targetImage,
    targetSlotPageLabel,
    hostSuggestedTarget,
    params,
    constrainedReferences,
    reasoningByTool,
    generationTiming,
    resolvedApiKey,
    useEnvDefaultModelId,
    signal,
    onProgressStart,
    onPhase,
  } = args;

  const targetImageResolution =
    targetImage?.resolution ??
    (targetImage?.imageData ? await getImageDimensions(targetImage.imageData) : undefined);

  // The Upscale selector persists a tier token ("hd"), so this is the first
  // point that knows the pixels it stands for — needed by both the prompt's
  // size sentence and the size token the request carries.
  const targetResolutionParam = findTargetResolutionParam(tool.parameters);
  const upscaleTarget = targetResolutionParam
    ? resolveUpscaleTarget(
        params[targetResolutionParam.name],
        targetImageResolution,
        hostSuggestedTarget,
      )
    : null;

  const basePrompt = tool.promptTemplate(
    upscaleTarget
      ? { ...params, [RESOLVED_TARGET_PIXELS_PARAM]: formatUpscaleDimensions(upscaleTarget) }
      : params,
  );
  let requestedAspectRatio = getRequestedAspectRatioValue(tool, params);
  if (tool.derivedResultMode === "animated-gif") {
    // The sheet's canvas shape follows the frame-count's grid layout
    // (16 portrait cells don't fit a 16:9 canvas, so 4x4 goes square).
    requestedAspectRatio = getGifSheetAspectRatio(parseGifFrameCount(params.frameCount));
  }

  // Normalize every source to a base64 data URL. Book images from the Bloom
  // host (and anything else dragged in by URL) arrive as http(s) URLs, which
  // the OpenRouter client and local background removal cannot consume.
  const targetImageData =
    requiresEditImage && targetImage ? await ensureDataUrl(targetImage.imageData) : null;
  const referenceImageData = await Promise.all(
    constrainedReferences.map((h) => ensureDataUrl(h.imageData)),
  );
  const sourceImages = [...(targetImageData ? [targetImageData] : []), ...referenceImageData];
  // Named images (e.g. characters named in the strip) get their name sent
  // alongside the pixels so the prompt can refer to them by name. Aligned by
  // index with sourceImages.
  const imageLabels = [
    ...(requiresEditImage && targetImage ? [targetImage.name ?? null] : []),
    ...constrainedReferences.map((h) => h.name ?? null),
  ];

  // Tools that decompose a page (break-comic) must not downscale it. Match
  // the output size + aspect ratio to the input so resolution is preserved
  // (a 3508px poster -> 4K), instead of falling back to a square 1K default.
  let requestedSize = params.size ?? tool.hiddenSizeDefault;
  let autoSizeResolution: { width: number; height: number } | undefined;
  if (tool.autoSizeFromInput && sourceImages[0]) {
    const inputResolution = await getImageDimensions(sourceImages[0]);
    if (inputResolution?.width && inputResolution?.height) {
      autoSizeResolution = inputResolution;
      requestedSize = pickSizeTokenForLongEdge(
        Math.max(inputResolution.width, inputResolution.height),
      );
      requestedAspectRatio = resolveAspectRatioValue(
        AUTO_ASPECT_RATIO,
        inputResolution,
        toolModel?.supportedAspectRatios,
      );
    }
  }

  if (upscaleTarget) {
    // Real models accept only tier tokens, so the exact request becomes the
    // smallest tier that isn't a downscale of it. The aspect ratio stays on
    // auto (the source's shape) — upscaling must not reframe the picture.
    requestedSize = pickSizeTokenForLongEdge(Math.max(upscaleTarget.width, upscaleTarget.height));
  }

  const promptWithoutAspectRatio =
    tool.id === "custom"
      ? `Edit the first image. If more images are provided, treat them as style/"like this" references.\n\nInstructions:\n${basePrompt}`
      : basePrompt;

  const usesLocalBackgroundRemoval = tool.id === "remove_background";
  const prompt = usesLocalBackgroundRemoval
    ? promptWithoutAspectRatio
    : `${promptWithoutAspectRatio}\n\n${getAspectRatioPromptHint(
        requestedAspectRatio,
        autoSizeResolution ?? targetImageResolution,
        toolModel?.supportedAspectRatios,
      )}`;
  const modelTimingKey = usesLocalBackgroundRemoval
    ? "local-background-removal"
    : useEnvDefaultModelId
      ? "default-image-model"
      : toolModel?.id || "default-image-model";
  const promptDurationKey = createPromptDurationKey(tool.id, modelTimingKey, prompt);
  const toolDurationKey = createToolDurationKey(tool.id, modelTimingKey);

  let processedImageData: string;
  let processedImages: string[] = [];
  let durationMs = 0;
  let cost = 0;
  let model = "";
  let generationText: string | null = null;
  let reasoningLevelForRequest: ModelReasoningLevel | null = null;
  const isBreakComic = tool.id === "break_comic_into_images";

  if (usesLocalBackgroundRemoval) {
    if (!targetImage || !targetImageData) {
      throw new Error("Select an image to edit before applying this tool.");
    }

    const progressStartedAt = getNowMs();
    onProgressStart(
      resolveEstimatedDurationMs(generationTiming, promptDurationKey, toolDurationKey),
    );

    const result = await removeBackgroundFromImage(targetImageData, { signal });

    processedImageData = await applyPostProcessingPipeline(
      result.imageData,
      tool.postProcessingFunctions,
    );
    processedImages = [processedImageData];
    durationMs = result.durationMs;
    model = result.model;

    return {
      processedImageData,
      processedImages,
      durationMs,
      cost,
      model,
      generationText,
      reasoningLevelForRequest,
      prompt,
      promptDurationKey,
      toolDurationKey,
      requestedSize,
      targetImageResolution,
      progressStartedAt,
      shouldRefreshCredits: false,
    };
  }

  const canRunWithoutApiKey = canUseLocalDummyModelWithoutApiKey(toolModel?.id);
  if (!resolvedApiKey && !canRunWithoutApiKey) {
    throw new MissingApiKeyError();
  }

  // In E2E, we authenticate via an env key. In that mode we want the model to
  // be controlled by VITE_OPENROUTER_IMAGE_MODEL (from the dev server env)
  // rather than whatever the UI's default model happens to be.
  const modelIdForRequest = canRunWithoutApiKey
    ? toolModel?.id
    : useEnvDefaultModelId
      ? undefined
      : toolModel?.id;
  // Per-tool reasoning: the user's override, then the tool's hard
  // imageReasoningLevel cap (e.g. break-comic stays at the model default so
  // it doesn't "think" away its image-output budget), then the model's
  // initial level. See resolveToolReasoningLevel.
  reasoningLevelForRequest = resolveToolReasoningLevel(tool, toolModel ?? null, reasoningByTool);

  // Build image configuration from tool parameters.
  const imageConfig: ImageConfig = {
    aspectRatio: resolveAspectRatioValue(
      requestedAspectRatio,
      autoSizeResolution ?? targetImageResolution,
      toolModel?.supportedAspectRatios,
    ),
    size: requestedSize,
    ...(upscaleTarget ? { targetDimensions: upscaleTarget } : {}),
  };

  if (tool.autoSizeFromInput) {
    console.log("[break-comic] request size/aspect", {
      requestedSize,
      aspect: imageConfig.aspectRatio,
      inputResolution: autoSizeResolution,
    });
  }

  const progressStartedAt = getNowMs();
  onProgressStart(resolveEstimatedDurationMs(generationTiming, promptDurationKey, toolDurationKey));
  onPhase(0);

  const editOptions: EditImageOptions = {
    signal,
    imageConfig,
    reasoningLevel: reasoningLevelForRequest,
    imageLabels,
    targetSlotPageLabel,
  };
  const result = await editImage(
    sourceImages,
    prompt,
    resolvedApiKey as string,
    modelIdForRequest,
    editOptions,
  );

  const returnedImages = result.images?.length ? result.images : [result.imageData];
  processedImages = await Promise.all(
    returnedImages.map((image) => applyPostProcessingPipeline(image, tool.postProcessingFunctions)),
  );
  processedImageData = processedImages[0];
  durationMs = result.duration;
  cost = result.cost;
  model = result.model;
  generationText = result.text ?? null;

  if (returnedImages.length > 1) {
    console.log("[break-comic] model returned multiple images", {
      toolId: tool.id,
      imagesReturned: returnedImages.length,
    });
  }

  if (isBreakComic && resolvedApiKey) {
    onPhase(1);
    // The cleanup-edit image call carries no caption JSON (and models like
    // Gemini 3.1 Flash can't return image+text in one turn), so transcribe
    // the captions from the ORIGINAL page in a separate cheap text call.
    // Reading order matches the edited sheet because the edit preserves the
    // page layout.
    const captionsResult = await generateText(
      [sourceImages[0]],
      BREAK_COMIC_CAPTIONS_PROMPT,
      resolvedApiKey,
      { signal, modelId: BREAK_COMIC_TEXT_MODEL },
    );
    console.log("[break-comic] captions call result", {
      model: captionsResult.model,
      textChars: captionsResult.text.length,
      cost: captionsResult.cost,
    });
    generationText = captionsResult.text;
    durationMs += captionsResult.duration;
    cost += captionsResult.cost;
  }

  return {
    processedImageData,
    processedImages,
    durationMs,
    cost,
    model,
    generationText,
    reasoningLevelForRequest,
    prompt,
    promptDurationKey,
    toolDurationKey,
    requestedSize,
    targetImageResolution,
    progressStartedAt,
    shouldRefreshCredits: !canRunWithoutApiKey,
  };
}

const getNowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
