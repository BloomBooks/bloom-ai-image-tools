const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface ValidateGoogleApiKeyOptions {
  signal?: AbortSignal;
}

export interface GoogleApiKeyStatus {
  modelCount: number;
}

function normalizeErrorString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Validates a Google AI Studio API key by listing models. Google AI Studio has no
 * credits/balance endpoint, so a successful list-models call is the lightest
 * available "is this key valid?" check.
 */
export async function validateGoogleApiKey(
  apiKey: string,
  options?: ValidateGoogleApiKeyOptions,
): Promise<GoogleApiKeyStatus> {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error("Google AI Studio API key is missing.");
  }

  const response = await fetch(`${GOOGLE_BASE_URL}/models`, {
    method: "GET",
    headers: {
      "x-goog-api-key": key,
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
      normalizeErrorString(data?.error?.message) ||
      normalizeErrorString(rawText) ||
      response.statusText ||
      "";
    const preview = detailMessage.length > 500 ? `${detailMessage.slice(0, 500)}…` : detailMessage;
    throw new Error(`Google key verification failed: ${response.status} ${preview}`.trim());
  }

  const models = Array.isArray(data?.models) ? data.models : [];
  return { modelCount: models.length };
}
