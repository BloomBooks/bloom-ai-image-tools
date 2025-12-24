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
    }
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
// Note: google/gemini-2.5-flash-image (aka "Nano Banana") supports image output,
// whereas google/gemini-2.5-flash only supports text output.
const DEFAULT_IMAGE_MODEL = (
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.OPENROUTER_IMAGE_MODEL) ||
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_OPENROUTER_IMAGE_MODEL) ||
  process.env.OPENROUTER_IMAGE_MODEL ||
  process.env.VITE_OPENROUTER_IMAGE_MODEL ||
  "google/gemini-2.5-flash-image"
).trim();

export interface EditImageResult {
  imageData: string; // Data URL for the edited or generated image
  duration: number;
  model: string; // Model ID used (from API response)
  cost: number; // Cost in dollars (from API response usage.cost)
}

export interface ImageConfig {
  /** Shape: "Square", "Portrait Rectangle", "Landscape Rectangle" */
  shape?: string;
  /** Size: "1k", "2k", "4k" */
  size?: string;
}

export interface EditImageOptions {
  signal?: AbortSignal;
  imageConfig?: ImageConfig;
}

export interface OpenRouterCredits {
  totalCredits: number;
  totalUsage: number;
  remainingCredits: number;
}

export interface FetchOpenRouterCreditsOptions {
  signal?: AbortSignal;
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

/**
 * Maps shape parameter to Gemini aspect_ratio format.
 * Gemini supports: "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"
 */
function mapShapeToGeminiAspectRatio(shape?: string): string {
  switch (shape) {
    case "Portrait Rectangle":
      return "3:4";
    case "Landscape Rectangle":
      return "4:3";
    case "Square":
    default:
      return "1:1";
  }
}

/**
 * Maps shape parameter to OpenAI size format.
 * GPT image models support: "1024x1024", "1536x1024" (landscape), "1024x1536" (portrait)
 */
function mapShapeToOpenAISize(shape?: string): string {
  switch (shape) {
    case "Portrait Rectangle":
      return "1024x1536";
    case "Landscape Rectangle":
      return "1536x1024";
    case "Square":
    default:
      return "1024x1024";
  }
}

/**
 * Maps size parameter to Gemini image_size format.
 * Gemini supports: "1K", "2K", "4K" (note: uppercase K required)
 * Note: Gemini 2.5 Flash only supports 1K; Gemini 3 Pro supports 1K, 2K, 4K
 */
function mapSizeToGeminiImageSize(size?: string): string {
  switch (size?.toLowerCase()) {
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
  options?: EditImageOptions
): Promise<EditImageResult> => {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error(
      "OpenRouter API key is missing. Connect to OpenRouter to continue."
    );
  }

  const { signal, imageConfig } = options ?? {};
  const startTime = performance.now();
  const images = (base64Images || []).filter((x) => !!x);
  const hasImage = images.length > 0;
  const modelToUse = (modelId && modelId.trim()) || DEFAULT_IMAGE_MODEL;

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
  const geminiAspectRatio = mapShapeToGeminiAspectRatio(imageConfig?.shape);
  const geminiImageSize = mapSizeToGeminiImageSize(imageConfig?.size);
  // OpenAI-style: size as a direct parameter
  const openAISize = mapShapeToOpenAISize(imageConfig?.shape);

  const body: Record<string, any> = {
    model: modelToUse,
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
    const detailMessage =
      typeof data?.error?.message === "string"
        ? data.error.message.trim()
        : undefined;

    if (response.status === 402 && detailMessage) {
      throw new OpenRouterApiError(detailMessage, {
        status: response.status,
        reason: "insufficient-credits",
        detailMessage,
        infoUrl: OPENROUTER_KEYS_URL,
      });
    }

    const message = detailMessage || rawText || response.statusText || "";
    const preview =
      message.length > 500 ? `${message.slice(0, 500)}…` : message;
    throw new OpenRouterApiError(
      `OpenRouter request failed: ${response.status} ${preview}`,
      {
        status: response.status,
        detailMessage,
      }
    );
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
    duration: performance.now() - startTime,
    model: responseModel,
    cost: responseCost,
  };
};

export const fetchOpenRouterCredits = async (
  apiKey: string,
  options?: FetchOpenRouterCreditsOptions
): Promise<OpenRouterCredits> => {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error(
      "OpenRouter API key is missing. Connect to OpenRouter to continue."
    );
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
    const detailMessage =
      typeof data?.error?.message === "string"
        ? data.error.message.trim()
        : undefined;
    const message = detailMessage || rawText || response.statusText || "";
    const preview =
      message.length > 500 ? `${message.slice(0, 500)}…` : message;
    throw new OpenRouterApiError(
      `Failed to fetch OpenRouter credits: ${response.status} ${preview}`,
      {
        status: response.status,
        detailMessage,
      }
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
