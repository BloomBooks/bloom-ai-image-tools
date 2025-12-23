const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
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
  modelId?: string
): Promise<EditImageResult> => {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error(
      "OpenRouter API key is missing. Connect to OpenRouter to continue."
    );
  }

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

  const body = {
    model: modelToUse,
    messages: [
      {
        role: "user",
        content,
      },
    ],
    modalities: ["text", "image"],
    stream: false,
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
  });

  const rawText = await response.text().catch(() => "");
  let data: any = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { _nonJsonBody: rawText };
  }

  if (!response.ok) {
    const message = rawText || response.statusText;
    const preview =
      message.length > 500 ? `${message.slice(0, 500)}…` : message;
    throw new Error(`OpenRouter request failed: ${response.status} ${preview}`);
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
