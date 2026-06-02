import type { ModelReasoningLevel } from "../types";
import { getOpenAIOrientation } from "../lib/aspectRatios";
import { canUseLocalDummyModelWithoutApiKey, LOCAL_DUMMY_MODEL_ID } from "../lib/localModels";
import { getRequestModelIds } from "../lib/modelsCatalog";

/**
 * Builds the OpenRouter model selector for a request body. When a model
 * declares a fallback key we send a `models` array so OpenRouter routes to the
 * first key that works; otherwise we send the single `model` field.
 */
function buildModelSelector(modelId: string): Record<string, unknown> {
  const ids = getRequestModelIds(modelId);
  return ids.length > 1 ? { models: ids } : { model: modelId };
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_KEYS_URL = "https://openrouter.ai/settings/keys";

export type OpenRouterApiErrorReason = "insufficient-credits";

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
  imageData: string; // Data URL for the edited or generated image
  duration: number;
  model: string; // Model ID used (from API response)
  cost: number; // Cost in dollars (from API response usage.cost)
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
    return {
      imageData: await createLocalDummyImage(options?.imageConfig?.aspectRatio),
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
    for (const dataUrl of images) {
      const { base64, mimeType } = dataUrlToParts(dataUrl);
      content.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}` },
      });
    }
  }

  // Build image generation parameters for different providers
  // Gemini-style: aspect_ratio and image_size in image_config
  const geminiAspectRatio = mapAspectRatioToGeminiAspectRatio(imageConfig?.aspectRatio);
  const geminiImageSize = mapSizeToGeminiImageSize(imageConfig?.size);
  // OpenAI-style: size as a direct parameter
  const openAISize = mapAspectRatioToOpenAISize(imageConfig?.aspectRatio);

  const body: Record<string, any> = {
    ...buildModelSelector(modelToUse),
    messages: [
      {
        role: "user",
        content,
      },
    ],
    modalities: ["text", "image"],
    stream: false,
    // OpenAI-style size parameter (for DALL-E, gpt-image models)
    size: openAISize,
    // Gemini-style image configuration
    image_config: {
      aspect_ratio: geminiAspectRatio,
      image_size: geminiImageSize,
    },
  };

  if (reasoningLevel !== "default") {
    body.reasoning = {
      effort: reasoningLevel === "none" ? "none" : reasoningLevel,
      // We only need the image output, not the model's reasoning text.
      exclude: true,
    };
  }

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

  const rawText = await response.text().catch(() => "");
  let data: any = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { _nonJsonBody: rawText };
  }

  if (!response.ok) {
    const detailMessage = getOpenRouterErrorDetail(data);

    if (response.status === 402 && detailMessage) {
      throw new OpenRouterApiError(detailMessage, {
        status: response.status,
        reason: "insufficient-credits",
        detailMessage,
        infoUrl: OPENROUTER_KEYS_URL,
      });
    }

    const message = detailMessage || rawText || response.statusText || "";
    const preview = message.length > 500 ? `${message.slice(0, 500)}…` : message;
    throw new OpenRouterApiError(`OpenRouter request failed: ${response.status} ${preview}`, {
      status: response.status,
      detailMessage,
    });
  }

  // Try to extract an image URL/base64 from chat-style response
  const choice = data?.choices?.[0];
  const contentArray = choice?.message?.content;
  const imagesArray = choice?.message?.images;

  let imageUrl: string | null = null;
  // First check the content array (some models return images here)
  if (Array.isArray(contentArray)) {
    for (const part of contentArray) {
      if (part?.type === "image_url" && part?.image_url?.url) {
        imageUrl = part.image_url.url as string;
        break;
      }
    }
  }
  // Also check the images array (Gemini models return images here)
  if (!imageUrl && Array.isArray(imagesArray)) {
    for (const part of imagesArray) {
      if (part?.type === "image_url" && part?.image_url?.url) {
        imageUrl = part.image_url.url as string;
        break;
      }
    }
  }

  const b64 = imageUrl?.startsWith("data:image")
    ? imageUrl
    : (data?.data?.[0]?.b64_json as string | undefined)
      ? `data:image/png;base64,${data.data[0].b64_json}`
      : null;

  if (!b64) {
    throw new Error("OpenRouter did not return an image.");
  }

  // Extract model and cost from the API response
  const responseModel = (data?.model as string) || modelToUse;
  const responseCost = (data?.usage?.cost as number) ?? 0;

  return {
    imageData: b64,
    duration: getNow() - localStartTime,
    model: responseModel,
    cost: responseCost,
  };
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

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": window.location.origin,
      "X-Title": "Bloom AI Image Tools",
    },
    body: JSON.stringify({
      ...buildModelSelector(modelToUse),
      messages: [
        {
          role: "user",
          content,
        },
      ],
      stream: false,
    }),
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

    if (response.status === 402 && detailMessage) {
      throw new OpenRouterApiError(detailMessage, {
        status: response.status,
        reason: "insufficient-credits",
        detailMessage,
        infoUrl: OPENROUTER_KEYS_URL,
      });
    }

    const message = detailMessage || rawText || response.statusText || "";
    const preview = message.length > 500 ? `${message.slice(0, 500)}…` : message;
    throw new OpenRouterApiError(`OpenRouter request failed: ${response.status} ${preview}`, {
      status: response.status,
      detailMessage,
    });
  }

  const text =
    extractTextContent(data?.choices?.[0]?.message?.content) ||
    normalizeErrorString(data?.choices?.[0]?.message?.text) ||
    normalizeErrorString(data?.output_text);

  if (!text) {
    throw new Error("OpenRouter did not return text.");
  }

  const normalizedText = stripMarkdownCodeFence(text);

  return {
    text: normalizedText,
    duration: performance.now() - startTime,
    model: (data?.model as string) || modelToUse,
    cost: (data?.usage?.cost as number) ?? 0,
  };
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
