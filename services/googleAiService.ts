import type { EditImageOptions, EditImageResult } from "./openRouterService";
import { mapAspectRatioToGeminiAspectRatio, mapSizeToGeminiImageSize } from "./openRouterService";

const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Default Google model name (without the OpenRouter "google/" prefix).
const DEFAULT_GOOGLE_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

const getNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

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

function normalizeErrorString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Strips the OpenRouter-style "google/" prefix to get the native Google model name.
 * e.g. "google/gemini-3.1-flash-image-preview" -> "gemini-3.1-flash-image-preview".
 */
function toGoogleModelName(modelId?: string): string {
  const cleaned = (modelId || "").trim();
  if (!cleaned) {
    return DEFAULT_GOOGLE_IMAGE_MODEL;
  }
  return cleaned.replace(/^google\//i, "") || DEFAULT_GOOGLE_IMAGE_MODEL;
}

/**
 * Generates or edits an image using Google's Generative Language API directly
 * (Gemini "generateContent"). Mirrors the shape of openRouterService.editImage so
 * callers can swap providers transparently.
 *
 * Note: the reasoningLevel option is currently honored only on the OpenRouter path;
 * the Google REST path ignores it.
 */
export const editImageWithGoogle = async (
  base64Images: string[],
  prompt: string,
  apiKey: string,
  modelId?: string,
  options?: EditImageOptions,
): Promise<EditImageResult> => {
  const startTime = getNow();

  const key = apiKey?.trim();
  if (!key) {
    throw new Error("Google AI Studio API key is missing. Add a key in settings to continue.");
  }

  const { signal, imageConfig } = options ?? {};
  const modelName = toGoogleModelName(modelId);
  const images = (base64Images || []).filter((x) => !!x);

  const parts: any[] = [{ text: prompt }];
  for (const dataUrl of images) {
    const { base64, mimeType } = dataUrlToParts(dataUrl);
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64,
      },
    });
  }

  // Snake_case field names match what openRouterService.ts already sends to
  // Gemini successfully (image_config / aspect_ratio / image_size).
  const imageConfigBody: Record<string, any> = {
    aspect_ratio: mapAspectRatioToGeminiAspectRatio(imageConfig?.aspectRatio),
  };
  if (imageConfig?.size) {
    imageConfigBody.image_size = mapSizeToGeminiImageSize(imageConfig.size);
  }

  const body = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      image_config: imageConfigBody,
    },
  };

  const response = await fetch(
    `${GOOGLE_BASE_URL}/models/${encodeURIComponent(modelName)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    },
  );

  const rawText = await response.text().catch(() => "");
  let data: any = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { _nonJsonBody: rawText };
  }

  if (!response.ok) {
    const detailMessage =
      normalizeErrorString(data?.error?.message) ||
      normalizeErrorString(rawText) ||
      response.statusText ||
      "";
    const preview = detailMessage.length > 500 ? `${detailMessage.slice(0, 500)}…` : detailMessage;
    throw new Error(`Google AI request failed: ${response.status} ${preview}`);
  }

  // Find the first inline image part in the response.
  const responseParts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  let imageUrl: string | null = null;
  for (const part of responseParts) {
    const inline = part?.inlineData ?? part?.inline_data;
    const inlineData = inline?.data;
    if (typeof inlineData === "string" && inlineData) {
      const mimeType = inline?.mimeType || inline?.mime_type || "image/png";
      imageUrl = `data:${mimeType};base64,${inlineData}`;
      break;
    }
  }

  if (!imageUrl) {
    throw new Error("Google AI did not return an image.");
  }

  return {
    imageData: imageUrl,
    duration: getNow() - startTime,
    model: (data?.modelVersion as string) || modelId || modelName,
    cost: 0,
  };
};
