import type { ModelReasoningLevel } from "../types";
import { getOpenAIOrientation } from "../lib/aspectRatios";
import { canUseLocalDummyModelWithoutApiKey, LOCAL_DUMMY_MODEL_ID } from "../lib/localModels";
import { getModelNameById, getRequestModelIds } from "../lib/modelsCatalog";

/**
 * Detects OpenRouter errors that mean "this particular model key cannot serve
 * the request" — a retired/renamed key, or one whose endpoints don't offer the
 * requested output modality. These are the cases where failing over to the next
 * candidate model id is the right move (unlike credits/rate-limit/no-image,
 * which are not model-identity problems and must not switch models).
 *
 * We try candidate ids ONE PER REQUEST rather than handing OpenRouter a `models`
 * array, because OpenRouter rejects the whole array with a 400 if any id in it
 * is unrecognized. That makes the array useless for the case we care about most
 * — a not-yet-published successor key — but a standalone follow-up request to
 * the successor works fine once it goes live.
 */
function isModelUnavailableError(
  status: number,
  detailMessage: string | null | undefined,
): boolean {
  const msg = (detailMessage || "").toLowerCase();
  // 404 "No endpoints found that support the requested output modalities: ..."
  if (status === 404 && (msg.includes("no endpoints") || msg.includes("modalit"))) {
    return true;
  }
  // "<id> is not a valid model ID" — unknown/retired key (usually 400 or 404).
  return msg.includes("not a valid model");
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_KEYS_URL = "https://openrouter.ai/settings/keys";

export type OpenRouterApiErrorReason = "insufficient-credits" | "rate-limited";

export class OpenRouterApiError extends Error {
  status: number;
  reason?: OpenRouterApiErrorReason;
  detailMessage?: string;
  infoUrl?: string;

  constructor(
    message: string,
    options: {
      status: number;
      reason?: OpenRouterApiErrorReason;
      detailMessage?: string;
      infoUrl?: string;
    },
  ) {
    super(message);
    this.name = "OpenRouterApiError";
    this.status = options.status;
    this.reason = options.reason;
    this.detailMessage = options.detailMessage;
    this.infoUrl = options.infoUrl;
    Object.setPrototypeOf(this, OpenRouterApiError.prototype);
  }
}
// Pick an image-generation-capable model; override with env OPENROUTER_IMAGE_MODEL if needed.
// Note: google/gemini-3.1-flash-lite-preview (aka "Nano Banana") supports image output,
// whereas google/gemini-2.5-flash only supports text output.
const DEFAULT_IMAGE_MODEL = (
  (typeof import.meta !== "undefined" && (import.meta as any).env?.OPENROUTER_IMAGE_MODEL) ||
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_OPENROUTER_IMAGE_MODEL) ||
  process.env.OPENROUTER_IMAGE_MODEL ||
  process.env.VITE_OPENROUTER_IMAGE_MODEL ||
  "google/gemini-3.1-flash-lite-preview"
).trim();

const DEFAULT_TEXT_MODEL = "~google/gemini-flash-latest";

export interface EditImageResult {
  imageData: string; // Data URL for the FIRST returned image (back-compat)
  /**
   * ALL images the model returned, in order, as data URLs. Usually length 1,
   * but interleaved image models (e.g. Gemini 3 Pro Image) can emit several in
   * one response — e.g. one image per comic panel instead of a single grid.
   * `imageData` is `images[0]`.
   */
  images: string[];
  duration: number;
  model: string; // Model ID used (from API response)
  cost: number; // Cost in dollars (from API response usage.cost)
  /** The model's text-channel response, if any (e.g. structured JSON alongside the image). */
  text?: string;
}

export interface GenerateTextResult {
  text: string;
  duration: number;
  model: string;
  cost: number;
}

export interface ImageConfig {
  /** Explicit aspect ratio, for example "1:1" or "16:9". */
  aspectRatio?: string;
  /** Size: "512k", "1k", "2k", "4k" */
  size?: string;
}

export interface EditImageOptions {
  signal?: AbortSignal;
  imageConfig?: ImageConfig;
  reasoningLevel?: ModelReasoningLevel;
  /**
   * Optional human-facing names aligned by index with `base64Images`. When a
   * name is present, a short text part is inserted right before that image so
   * the model can associate the picture with the name the prompt refers to
   * (e.g. a character called "Maria"). Use null/"" for unlabeled images.
   */
  imageLabels?: (string | null | undefined)[];
}

export interface GenerateTextOptions {
  signal?: AbortSignal;
  modelId?: string;
}

export interface OpenRouterCredits {
  totalCredits: number;
  totalUsage: number;
  remainingCredits: number;
}

export interface FetchOpenRouterCreditsOptions {
  signal?: AbortSignal;
}

function normalizeErrorString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function getOpenRouterErrorDetail(data: any): string | undefined {
  return (
    normalizeErrorString(data?.error?.metadata?.raw) ||
    normalizeErrorString(data?.error?.message) ||
    normalizeErrorString(data?.message)
  );
}

/**
 * OpenRouter's raw 429 message ("...is temporarily rate-limited upstream.
 * Please retry shortly, or add your own key...") is confusing for end users.
 * Rewrite it into something approachable that names the model in plain terms.
 */
function buildRateLimitMessage(modelId: string): string {
  const friendlyName = getModelNameById(modelId) || modelId;
  return `Apparently, the AI server running ${friendlyName} is too busy at the moment, and they would like us to try again later. You could wait and retry, or use a different model.`;
}

function dataUrlToParts(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }

  return {
    mimeType: match[1] || "image/png",
    base64: match[2],
  };
}

const extractTextContent = (messageContent: unknown): string => {
  if (typeof messageContent === "string") {
    return messageContent.trim();
  }

  if (!Array.isArray(messageContent)) {
    return "";
  }

  return messageContent
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part?.type === "text" && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .join("\n")
    .trim();
};

const stripMarkdownCodeFence = (text: string): string => {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[\w-]*\s*\r?\n([\s\S]*?)\r?\n```$/);

  if (!match) {
    return trimmed;
  }

  return match[1].trim();
};

/**
 * Maps an explicit aspect ratio to Gemini's aspect_ratio format.
 */
function mapAspectRatioToGeminiAspectRatio(aspectRatio?: string): string {
  return aspectRatio?.trim() || "1:1";
}

/**
 * Maps an aspect ratio to OpenAI size format.
 * GPT image models support: "1024x1024", "1536x1024" (landscape), "1024x1536" (portrait)
 */
function mapAspectRatioToOpenAISize(aspectRatio?: string): string {
  switch (getOpenAIOrientation(aspectRatio)) {
    case "portrait":
      return "1024x1536";
    case "landscape":
      return "1536x1024";
    case "square":
    default:
      return "1024x1024";
  }
}

const getNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const resolveLocalDummyDimensions = (aspectRatio?: string) => {
  const match = aspectRatio?.trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) {
    return { width: 1024, height: 1024 };
  }

  const widthRatio = Number(match[1]);
  const heightRatio = Number(match[2]);
  if (!Number.isFinite(widthRatio) || !Number.isFinite(heightRatio) || heightRatio <= 0) {
    return { width: 1024, height: 1024 };
  }

  const ratio = widthRatio / heightRatio;
  if (ratio >= 1) {
    return {
      width: 1280,
      height: Math.max(720, Math.round(1280 / ratio)),
    };
  }

  return {
    width: Math.max(720, Math.round(1280 * ratio)),
    height: 1280,
  };
};

type DummyFigurePalette = {
  skin: string;
  shirt: string;
  accent: string;
  bottoms: string;
  hair: string;
};

const drawDummyFigure = (
  context: CanvasRenderingContext2D,
  centerX: number,
  baselineY: number,
  scale: number,
  palette: DummyFigurePalette,
) => {
  const headRadius = 34 * scale;
  const headY = baselineY - 168 * scale;
  const torsoTop = headY + 42 * scale;
  const torsoBottom = baselineY - 66 * scale;
  const shoulderWidth = 54 * scale;
  const hipWidth = 38 * scale;

  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";
  context.strokeStyle = "#332117";
  context.lineWidth = 6 * scale;

  context.fillStyle = palette.skin;
  context.beginPath();
  context.arc(centerX, headY, headRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = palette.hair;
  context.beginPath();
  context.arc(centerX, headY - 5 * scale, headRadius * 0.98, Math.PI, Math.PI * 2);
  context.lineTo(centerX + headRadius * 0.88, headY);
  context.quadraticCurveTo(centerX, headY - headRadius * 1.2, centerX - headRadius * 0.88, headY);
  context.closePath();
  context.fill();

  context.fillStyle = palette.accent;
  context.beginPath();
  context.arc(centerX - 12 * scale, headY + 4 * scale, 5 * scale, 0, Math.PI * 2);
  context.arc(centerX + 12 * scale, headY + 4 * scale, 5 * scale, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "#59392a";
  context.lineWidth = 3 * scale;
  context.beginPath();
  context.arc(centerX - 12 * scale, headY + 4 * scale, 6 * scale, 0, Math.PI * 2);
  context.arc(centerX + 12 * scale, headY + 4 * scale, 6 * scale, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.arc(centerX - 6 * scale, headY + 14 * scale, 3 * scale, 0, Math.PI * 2);
  context.arc(centerX + 6 * scale, headY + 14 * scale, 3 * scale, 0, Math.PI * 2);
  context.stroke();

  context.beginPath();
  context.moveTo(centerX - 14 * scale, headY + 24 * scale);
  context.quadraticCurveTo(centerX, headY + 34 * scale, centerX + 14 * scale, headY + 24 * scale);
  context.stroke();

  context.fillStyle = palette.shirt;
  context.strokeStyle = "#332117";
  context.lineWidth = 5 * scale;
  context.beginPath();
  context.moveTo(centerX - shoulderWidth, torsoTop);
  context.lineTo(centerX + shoulderWidth, torsoTop);
  context.lineTo(centerX + hipWidth, torsoBottom);
  context.lineTo(centerX - hipWidth, torsoBottom);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = palette.accent;
  context.beginPath();
  context.moveTo(centerX - 10 * scale, torsoTop);
  context.lineTo(centerX + 10 * scale, torsoTop);
  context.lineTo(centerX, torsoTop + 18 * scale);
  context.closePath();
  context.fill();

  context.strokeStyle = palette.skin;
  context.lineWidth = 10 * scale;
  context.beginPath();
  context.moveTo(centerX - shoulderWidth + 4 * scale, torsoTop + 18 * scale);
  context.lineTo(centerX - 64 * scale, torsoTop + 70 * scale);
  context.moveTo(centerX + shoulderWidth - 4 * scale, torsoTop + 18 * scale);
  context.lineTo(centerX + 64 * scale, torsoTop + 70 * scale);
  context.stroke();

  context.strokeStyle = "#59392a";
  context.lineWidth = 4 * scale;
  context.beginPath();
  context.moveTo(centerX - shoulderWidth + 4 * scale, torsoTop + 18 * scale);
  context.lineTo(centerX - 64 * scale, torsoTop + 70 * scale);
  context.moveTo(centerX + shoulderWidth - 4 * scale, torsoTop + 18 * scale);
  context.lineTo(centerX + 64 * scale, torsoTop + 70 * scale);
  context.stroke();

  context.fillStyle = palette.bottoms;
  context.strokeStyle = "#332117";
  context.lineWidth = 5 * scale;
  context.fillRect(centerX - 34 * scale, torsoBottom - 2 * scale, 68 * scale, 38 * scale);
  context.strokeRect(centerX - 34 * scale, torsoBottom - 2 * scale, 68 * scale, 38 * scale);

  context.strokeStyle = palette.skin;
  context.lineWidth = 10 * scale;
  context.beginPath();
  context.moveTo(centerX - 18 * scale, torsoBottom + 36 * scale);
  context.lineTo(centerX - 26 * scale, baselineY);
  context.moveTo(centerX + 18 * scale, torsoBottom + 36 * scale);
  context.lineTo(centerX + 26 * scale, baselineY);
  context.stroke();

  context.strokeStyle = "#59392a";
  context.lineWidth = 4 * scale;
  context.beginPath();
  context.moveTo(centerX - 18 * scale, torsoBottom + 36 * scale);
  context.lineTo(centerX - 26 * scale, baselineY);
  context.moveTo(centerX + 18 * scale, torsoBottom + 36 * scale);
  context.lineTo(centerX + 26 * scale, baselineY);
  context.stroke();

  context.strokeStyle = "#5c3d2e";
  context.lineWidth = 6 * scale;
  context.beginPath();
  context.moveTo(centerX - 38 * scale, baselineY + 6 * scale);
  context.lineTo(centerX - 16 * scale, baselineY + 6 * scale);
  context.moveTo(centerX + 16 * scale, baselineY + 6 * scale);
  context.lineTo(centerX + 38 * scale, baselineY + 6 * scale);
  context.stroke();
  context.restore();
};

const createLocalDummyImage = async (aspectRatio?: string): Promise<string> => {
  if (typeof document === "undefined") {
    throw new Error("Local dummy model requires a browser environment.");
  }

  const { width, height } = resolveLocalDummyDimensions(aspectRatio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context unavailable for local dummy model.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  const baselineY = Math.round(height * 0.8);
  const figureScale = Math.min(width / 1280, height / 960);

  context.strokeStyle = "#d7d7d7";
  context.lineWidth = Math.max(2, Math.round(2 * figureScale));
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(width * 0.18, baselineY + 8 * figureScale);
  context.lineTo(width * 0.82, baselineY + 8 * figureScale);
  context.stroke();

  drawDummyFigure(context, width * 0.28, baselineY, figureScale * 1.08, {
    skin: "#8d5a3b",
    shirt: "#e6b80f",
    accent: "#b33b2d",
    bottoms: "#7e5637",
    hair: "#3c2415",
  });
  drawDummyFigure(context, width * 0.5, baselineY + 8 * figureScale, figureScale * 0.88, {
    skin: "#9b6643",
    shirt: "#e8b0c0",
    accent: "#b55d7d",
    bottoms: "#d88aa0",
    hair: "#3c2415",
  });
  drawDummyFigure(context, width * 0.72, baselineY + 4 * figureScale, figureScale, {
    skin: "#8c5738",
    shirt: "#8e5bc7",
    accent: "#6b3fa8",
    bottoms: "#63baa8",
    hair: "#3c2415",
  });

  return canvas.toDataURL("image/png");
};

/**
 * Maps size parameter to Gemini image_size format.
 * Gemini supports: "1K", "2K", "4K" (note: uppercase K required).
 * The UI exposes a 512k preset for Gemini 3.1 Flash, which maps to Gemini's
 * lowest supported image-size tier.
 */
function mapSizeToGeminiImageSize(size?: string): string {
  switch (size?.toLowerCase()) {
    case "512k":
      return "1K";
    case "2k":
      return "2K";
    case "4k":
      return "4K";
    case "1k":
    default:
      return "1K";
  }
}

/**
 * `.catch` handler for response-body reads: rethrow a cancellation so it
 * propagates, but treat any other read failure as an empty body (the callers
 * tolerate that and surface a clearer downstream error).
 */
const rethrowIfAbort = (error: unknown): string => {
  if ((error as { name?: string } | null)?.name === "AbortError") {
    throw error;
  }
  return "";
};

/**
 * Uses OpenRouter image endpoints to generate or edit an image.
 * @param base64Images - Source images for editing/reference (data URLs). Empty array for generation.
 * @param prompt - Instruction sent to the model.
 * @param apiKey - OpenRouter API key. Sources (handled by caller):
 *   1. Playwright tests: injected via Vite's define from BLOOM_OPENROUTER_KEY_FOR_PLAYWRIGHT_TESTS
 *   2. App OAuth flow: obtained via OpenRouter OAuth and stored in localStorage
 *   3. App manual entry (future): user-provided key
 */
export const editImage = async (
  base64Images: string[],
  prompt: string,
  apiKey: string,
  modelId?: string,
  options?: EditImageOptions,
): Promise<EditImageResult> => {
  const startTime = getNow();
  const modelToUse = (modelId && modelId.trim()) || DEFAULT_IMAGE_MODEL;

  if (canUseLocalDummyModelWithoutApiKey(modelToUse)) {
    const dummyImage = await createLocalDummyImage(options?.imageConfig?.aspectRatio);
    return {
      imageData: dummyImage,
      images: [dummyImage],
      duration: getNow() - startTime,
      model: LOCAL_DUMMY_MODEL_ID,
      cost: 0,
    };
  }

  const key = apiKey?.trim();
  if (!key) {
    throw new Error("OpenRouter API key is missing. Connect to OpenRouter to continue.");
  }

  const { signal, imageConfig } = options ?? {};
  const reasoningLevel = options?.reasoningLevel ?? "default";
  const localStartTime = getNow();
  const images = (base64Images || []).filter((x) => !!x);
  const hasImage = images.length > 0;

  const content: any[] = [{ type: "text", text: prompt }];
  if (hasImage) {
    const labels = options?.imageLabels ?? [];
    images.forEach((dataUrl, index) => {
      const label = labels[index]?.trim();
      if (label) {
        content.push({
          type: "text",
          text: `The next image shows "${label}". When the instructions mention "${label}", they refer to the subject of this image.`,
        });
      }
      const { base64, mimeType } = dataUrlToParts(dataUrl);
      content.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      });
    });
  }

  // Build image generation parameters for different providers.
  // - google/* (Gemini): uses image_config with image_size "1K"|"2K"|"4K"
  // - openai/gpt-5.4-image*: uses image_config but only supports "1K"|"2K" (not "4K")
  // - other OpenAI (gpt-image-1, DALL-E, etc.): uses size as pixel dimensions
  const isGeminiModel = modelToUse.startsWith("google/");
  const isGpt54ImageModel = modelToUse.startsWith("openai/gpt-5.4-image");
  const usesImageConfig = isGeminiModel || isGpt54ImageModel;

  const geminiAspectRatio = mapAspectRatioToGeminiAspectRatio(imageConfig?.aspectRatio);
  const rawImageSize = mapSizeToGeminiImageSize(imageConfig?.size);
  // gpt-5.4-image-2 caps at "2K"; cap any "4K" request to "2K" for those models
  const resolvedImageSize = !isGeminiModel && rawImageSize === "4K" ? "2K" : rawImageSize;

  // OpenAI-style size (pixel dimensions) for models that don't support image_config
  const openAISize = mapAspectRatioToOpenAISize(imageConfig?.aspectRatio);

  // Ordered model keys to try, one HTTP request each (see
  // isModelUnavailableError for why we don't send these as a `models` array).
  // The first is the chosen model; any others are declared fallbacks, e.g. a
  // renamed/successor key listed via the catalog's `fallbackId`.
  const candidateModelIds = getRequestModelIds(modelToUse);

  const body: Record<string, any> = {
    // `model` is set per candidate inside the failover loop below.
    messages: [
      {
        role: "user",
        content,
      },
    ],
    modalities: ["text", "image"],
    stream: false,
    // The generated image is billed as output tokens in the SAME budget as any
    // reasoning/commentary text. Without an explicit ceiling, a "thinking"
    // model (e.g. Gemini 3 Flash) can spend the default completion budget on
    // reasoning and hit finish_reason="length" (MAX_TOKENS) BEFORE it emits the
    // image — surfacing as "did not return an image." Give image requests ample
    // headroom so reasoning + image both fit. (Image output itself is small:
    // <=2520 tokens even at 4K, so this budget is almost entirely for thinking.)
    max_tokens: 64_000,
    // Provider-specific image size parameters — only include what the model accepts
    ...(usesImageConfig
      ? {
          image_config: {
            aspect_ratio: geminiAspectRatio,
            image_size: resolvedImageSize,
          },
        }
      : { size: openAISize }),
  };

  // Gemini image endpoints fail to return an image in several DIFFERENT ways,
  // all observed with the exact same request resent. Every attempt uses the
  // reasoning effort the user asked for — we never silently change it:
  //   - empty response: finish_reason="stop" with 0 completion tokens (costs
  //     only the prompt). Transient; a plain retry usually succeeds.
  //   - text without image: the model answers the text part of a combined
  //     image+text prompt but skips the image. Also transient; retry.
  //   - truncation: reasoning consumes the same output-token budget as the
  //     image, so finish_reason="length"/MAX_TOKENS arrives before the image.
  //     The whole budget was spent (and billed) on thinking, so retrying the
  //     same request is the EXPENSIVE failure — don't. Fail immediately with
  //     a message telling the user to pick a lower reasoning level.
  //
  // We never send effort:"none": several image endpoints (e.g. Gemini 3 Pro
  // Image) make reasoning mandatory and reject "none" with a 400 ("Reasoning is
  // mandatory for this endpoint and cannot be disabled"). "default" (and an
  // explicit "none" request) omit the reasoning parameter entirely and leave
  // the decision to the model.
  const MAX_IMAGE_ATTEMPTS = 3;
  const effort: string | null =
    reasoningLevel === "default" || reasoningLevel === "none" ? null : reasoningLevel;

  let lastNoImageDetail = "no text either";

  for (let modelIndex = 0; modelIndex < candidateModelIds.length; modelIndex += 1) {
    const modelForRequest = candidateModelIds[modelIndex];
    const hasFallbackModel = modelIndex < candidateModelIds.length - 1;
    const nextModelId = hasFallbackModel ? candidateModelIds[modelIndex + 1] : null;
    body.model = modelForRequest;
    let modelUnavailable = false;

    for (let attempt = 0; attempt < MAX_IMAGE_ATTEMPTS; attempt += 1) {
      if (effort) {
        // We only need the image output, not the model's reasoning text.
        body.reasoning = { effort, exclude: true };
      } else {
        delete body.reasoning;
      }

      // Log the request parameters (never the image bytes) so the full request is
      // visible in the console without opening the Network panel.
      console.log("[openRouter] image request", {
        model: modelForRequest,
        attempt: attempt + 1,
        attemptsPlanned: MAX_IMAGE_ATTEMPTS,
        reasoningLevelRequested: reasoningLevel,
        reasoningEffortSent: effort ?? "(omitted — model default)",
        modalities: body.modalities,
        maxTokens: body.max_tokens,
        sizeOpenAI: body.size,
        imageConfigGemini: body.image_config,
        inputImageCount: images.length,
        promptChars: prompt.length,
        promptPreview: prompt.length > 300 ? `${prompt.slice(0, 300)}…` : prompt,
      });

      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "Bloom AI Image Tools",
        },
        body: JSON.stringify(body),
        signal,
      });

      // If the user cancelled while the body was streaming, the read rejects with
      // AbortError — rethrow it so cancel propagates instead of being swallowed
      // into an empty body and treated as a retryable "no image" response.
      const rawText = await response.text().catch(rethrowIfAbort);
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = { _nonJsonBody: rawText };
      }

      if (!response.ok) {
        const detailMessage = getOpenRouterErrorDetail(data);

        // Retired/renamed key, or one with no image-output endpoint: try the next
        // candidate model instead of failing the whole request.
        if (hasFallbackModel && isModelUnavailableError(response.status, detailMessage)) {
          console.warn(
            `[openRouter] model "${modelForRequest}" unavailable (${response.status}); ` +
              `falling over to "${nextModelId}".`,
          );
          modelUnavailable = true;
          break;
        }

        if (response.status === 402 && detailMessage) {
          throw new OpenRouterApiError(detailMessage, {
            status: response.status,
            reason: "insufficient-credits",
            detailMessage,
            infoUrl: OPENROUTER_KEYS_URL,
          });
        }

        if (response.status === 429) {
          throw new OpenRouterApiError(buildRateLimitMessage(modelForRequest), {
            status: response.status,
            reason: "rate-limited",
            detailMessage,
          });
        }

        const message = detailMessage || rawText || response.statusText || "";
        const preview = message.length > 500 ? `${message.slice(0, 500)}…` : message;
        throw new OpenRouterApiError(`OpenRouter request failed: ${response.status} ${preview}`, {
          status: response.status,
          detailMessage,
        });
      }

      // Try to extract image(s) from chat-style response. Interleaved image
      // models can return MORE THAN ONE image (e.g. one per panel), so collect
      // them all in order rather than stopping at the first.
      const choice = data?.choices?.[0];
      const contentArray = choice?.message?.content;
      const imagesArray = choice?.message?.images;
      const finishReason = choice?.finish_reason ?? choice?.native_finish_reason ?? null;
      const returnedText =
        extractTextContent(contentArray) || normalizeErrorString(choice?.message?.text);

      const collectedImages: string[] = [];
      const addImage = (url: unknown) => {
        if (
          typeof url === "string" &&
          url.startsWith("data:image") &&
          !collectedImages.includes(url)
        ) {
          collectedImages.push(url);
        }
      };
      // Content array (some models return images here)
      if (Array.isArray(contentArray)) {
        for (const part of contentArray) {
          if (part?.type === "image_url" && part?.image_url?.url) addImage(part.image_url.url);
        }
      }
      // Images array (Gemini models return images here)
      if (Array.isArray(imagesArray)) {
        for (const part of imagesArray) {
          if (part?.type === "image_url" && part?.image_url?.url) addImage(part.image_url.url);
        }
      }
      // OpenAI-style b64_json data array (DALL·E / gpt-image)
      if (collectedImages.length === 0 && Array.isArray(data?.data)) {
        for (const entry of data.data) {
          if (entry?.b64_json) addImage(`data:image/png;base64,${entry.b64_json}`);
        }
      }

      // Log the response shape (counts/metadata only — never the image bytes).
      console.log("[openRouter] image response", {
        status: response.status,
        model: (data?.model as string) || modelForRequest,
        attempt: attempt + 1,
        reasoningEffortSent: effort ?? "(omitted — model default)",
        finishReason,
        imagesReturned: collectedImages.length,
        textChars: returnedText?.length ?? 0,
        textPreview: returnedText ? returnedText.slice(0, 400) : null,
        cost: (data?.usage?.cost as number) ?? null,
        usage: data?.usage ?? null,
      });

      if (collectedImages.length > 0) {
        return {
          imageData: collectedImages[0],
          images: collectedImages,
          duration: getNow() - localStartTime,
          model: (data?.model as string) || modelForRequest,
          cost: (data?.usage?.cost as number) ?? 0,
          text: extractTextContent(contentArray) || undefined,
        };
      }

      // No image. Diagnose what came back so the failure isn't opaque.
      const refusal = normalizeErrorString(choice?.message?.refusal);
      console.warn("[openRouter] No image in response.", {
        attempt,
        effort,
        model: (data?.model as string) || modelForRequest,
        finishReason,
        refusal: refusal || null,
        textPreview: returnedText ? returnedText.slice(0, 800) : null,
        hadContentArray: Array.isArray(contentArray),
        hadImagesArray: Array.isArray(imagesArray),
      });

      const detail =
        refusal ||
        returnedText ||
        (finishReason ? `finish_reason="${finishReason}"` : "") ||
        "no text either";
      lastNoImageDetail = detail.length > 300 ? `${detail.slice(0, 300)}…` : detail;

      const truncated = finishReason === "length" || finishReason === "MAX_TOKENS";
      if (truncated) {
        // The full output-token budget was spent (and billed) on reasoning, so
        // resending the same request would likely just burn it again. Tell the
        // user what to change instead of retrying or silently lowering it.
        const currentLevel =
          reasoningLevel === "default" || reasoningLevel === "none"
            ? "the model's default"
            : `"${reasoningLevel}"`;
        const lowerLevel =
          reasoningLevel === "high" ? '"medium"' : reasoningLevel === "medium" ? '"low"' : null;
        const suggestion = lowerLevel
          ? `Try lowering it to ${lowerLevel} in the model settings.`
          : reasoningLevel === "low"
            ? "Reasoning is already at the lowest level; try a smaller image size."
            : 'Try setting it to "low" in the model settings.';
        throw new Error(
          `The model spent its whole output budget thinking before producing the image. ` +
            `The reasoning level is currently ${currentLevel}. ${suggestion}`,
        );
      }

      if (attempt < MAX_IMAGE_ATTEMPTS - 1) {
        console.warn(
          `[openRouter] No image in response (attempt ${attempt + 1}/${MAX_IMAGE_ATTEMPTS}); retrying.`,
        );
      }
    }

    // The model served the request but never produced an image after every
    // retry. That's not a model-identity problem, so don't burn a fallback
    // model on it — surface the diagnostic below. (When the inner loop broke
    // because the model was unavailable, fall through to the next candidate.)
    if (!modelUnavailable) {
      break;
    }
  }

  throw new Error(
    `OpenRouter did not return an image. The model responded with: ${lastNoImageDetail}`,
  );
};

export const generateText = async (
  base64Images: string[],
  prompt: string,
  apiKey: string,
  options?: GenerateTextOptions,
): Promise<GenerateTextResult> => {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error("OpenRouter API key is missing. Connect to OpenRouter to continue.");
  }

  const startTime = performance.now();
  const images = (base64Images || []).filter((x) => !!x);
  const modelToUse = (options?.modelId && options.modelId.trim()) || DEFAULT_TEXT_MODEL;
  const content: any[] = [{ type: "text", text: prompt }];

  for (const dataUrl of images) {
    const { base64, mimeType } = dataUrlToParts(dataUrl);
    content.push({
      type: "image_url",
      image_url: { url: `data:${mimeType};base64,${base64}` },
    });
  }

  // One HTTP request per candidate model id (see isModelUnavailableError) — the
  // chosen model first, then any declared fallback/successor keys.
  const candidateModelIds = getRequestModelIds(modelToUse);
  const baseRequest = {
    messages: [
      {
        role: "user",
        content,
      },
    ],
    stream: false,
  };

  // Text endpoints occasionally return an OK response with an EMPTY body
  // (finish_reason="stop", 0 completion tokens) — the same transient hiccup we
  // see with image calls. A plain retry usually succeeds. This matters most for
  // the break-comic flow, where a successful (and expensive, multi-minute) image
  // edit is followed by a cheap caption/probe text call: a single empty text
  // response here used to throw "OpenRouter did not return text" and discard all
  // the prior work. HTTP errors are NOT retried — they fail immediately as before.
  const MAX_TEXT_ATTEMPTS = 3;
  let accumulatedCost = 0;
  let lastModel = modelToUse;

  for (let modelIndex = 0; modelIndex < candidateModelIds.length; modelIndex += 1) {
    const modelForRequest = candidateModelIds[modelIndex];
    const hasFallbackModel = modelIndex < candidateModelIds.length - 1;
    const nextModelId = hasFallbackModel ? candidateModelIds[modelIndex + 1] : null;
    const requestBody = JSON.stringify({ model: modelForRequest, ...baseRequest });
    let modelUnavailable = false;

    for (let attempt = 0; attempt < MAX_TEXT_ATTEMPTS; attempt += 1) {
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": window.location.origin,
          "X-Title": "Bloom AI Image Tools",
        },
        body: requestBody,
        signal: options?.signal,
      });

      const rawText = await response.text().catch(rethrowIfAbort);
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = { _nonJsonBody: rawText };
      }

      if (!response.ok) {
        const detailMessage = getOpenRouterErrorDetail(data);

        // Retired/renamed key, or one with no matching endpoint: try the next
        // candidate model instead of failing the whole request.
        if (hasFallbackModel && isModelUnavailableError(response.status, detailMessage)) {
          console.warn(
            `[openRouter] model "${modelForRequest}" unavailable (${response.status}); ` +
              `falling over to "${nextModelId}".`,
          );
          modelUnavailable = true;
          break;
        }

        if (response.status === 402 && detailMessage) {
          throw new OpenRouterApiError(detailMessage, {
            status: response.status,
            reason: "insufficient-credits",
            detailMessage,
            infoUrl: OPENROUTER_KEYS_URL,
          });
        }

        if (response.status === 429) {
          throw new OpenRouterApiError(buildRateLimitMessage(modelForRequest), {
            status: response.status,
            reason: "rate-limited",
            detailMessage,
          });
        }

        const message = detailMessage || rawText || response.statusText || "";
        const preview = message.length > 500 ? `${message.slice(0, 500)}…` : message;
        throw new OpenRouterApiError(`OpenRouter request failed: ${response.status} ${preview}`, {
          status: response.status,
          detailMessage,
        });
      }

      // An empty attempt may still bill prompt tokens, so keep a running total.
      accumulatedCost += (data?.usage?.cost as number) ?? 0;
      lastModel = (data?.model as string) || modelForRequest;

      const text =
        extractTextContent(data?.choices?.[0]?.message?.content) ||
        normalizeErrorString(data?.choices?.[0]?.message?.text) ||
        normalizeErrorString(data?.output_text);

      if (text) {
        return {
          text: stripMarkdownCodeFence(text),
          duration: performance.now() - startTime,
          model: lastModel,
          cost: accumulatedCost,
        };
      }

      const finishReason =
        data?.choices?.[0]?.finish_reason ?? data?.choices?.[0]?.native_finish_reason ?? null;
      console.warn(
        `[openRouter] No text in response (attempt ${attempt + 1}/${MAX_TEXT_ATTEMPTS}).`,
        { model: lastModel, finishReason },
      );

      if (attempt === MAX_TEXT_ATTEMPTS - 1) {
        throw new Error(
          `OpenRouter did not return text after ${MAX_TEXT_ATTEMPTS} attempts.` +
            (finishReason ? ` (finish_reason="${finishReason}")` : ""),
        );
      }
    }

    // Reached only when the inner loop broke because the model was unavailable;
    // fall through to the next candidate. (No-text exhaustion throws above.)
    if (!modelUnavailable) {
      break;
    }
  }

  // Unreachable: the loop either returns or throws on the final attempt.
  throw new Error("OpenRouter did not return text.");
};

export const fetchOpenRouterCredits = async (
  apiKey: string,
  options?: FetchOpenRouterCreditsOptions,
): Promise<OpenRouterCredits> => {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error("OpenRouter API key is missing. Connect to OpenRouter to continue.");
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/credits`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "Bloom AI Image Tools",
    },
    signal: options?.signal,
  });

  const rawText = await response.text().catch(() => "");
  let data: any = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { _nonJsonBody: rawText };
  }

  if (!response.ok) {
    const detailMessage = getOpenRouterErrorDetail(data);
    const message = detailMessage || rawText || response.statusText || "";
    const preview = message.length > 500 ? `${message.slice(0, 500)}…` : message;
    throw new OpenRouterApiError(
      `Failed to fetch OpenRouter credits: ${response.status} ${preview}`,
      {
        status: response.status,
        detailMessage,
      },
    );
  }

  const normalize = (value: unknown): number => {
    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const totalCredits = normalize(data?.data?.total_credits);
  const totalUsage = normalize(data?.data?.total_usage);
  const remainingCredits = Math.max(0, totalCredits - totalUsage);

  return {
    totalCredits,
    totalUsage,
    remainingCredits,
  };
};
