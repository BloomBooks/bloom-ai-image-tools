import {
  OPENROUTER_KEYS_URL,
  OpenRouterApiError,
} from "../services/openRouterService";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface OpenRouterKeyStatus {
  label: string | null;
  name: string | null;
  limit: number | null;
  limitRemaining: number | null;
  limitReset: string | null;
  usage: number;
}

export interface FetchOpenRouterKeyStatusOptions {
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

function maskOpenRouterApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 16) {
    return trimmed;
  }

  return `${trimmed.slice(0, 12)}...${trimmed.slice(-4)}`;
}

export async function fetchOpenRouterKeyStatus(
  apiKey: string,
  options?: FetchOpenRouterKeyStatusOptions,
): Promise<OpenRouterKeyStatus> {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error(
      "OpenRouter API key is missing. Connect to OpenRouter to continue.",
    );
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/keys`, {
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
    if (
      response.status === 403 &&
      detailMessage?.toLowerCase().includes("management key")
    ) {
      throw new OpenRouterApiError("OpenRouter key status is unavailable.", {
        status: response.status,
        detailMessage,
        infoUrl: OPENROUTER_KEYS_URL,
      });
    }

    const message = detailMessage || rawText || response.statusText || "";
    const preview =
      message.length > 500 ? `${message.slice(0, 500)}…` : message;
    throw new OpenRouterApiError(
      `Failed to fetch OpenRouter key status: ${response.status} ${preview}`,
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

  const normalizeNullable = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") {
      return null;
    }

    const num = typeof value === "number" ? value : Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const keyPreview = maskOpenRouterApiKey(key);
  const keyEntries: Array<Record<string, unknown>> = Array.isArray(data?.data)
    ? data.data
    : [];
  const matchingEntry =
    keyEntries.find(
      (entry: Record<string, unknown>) =>
        normalizeErrorString(entry.label) === keyPreview,
    ) ?? (keyEntries.length === 1 ? keyEntries[0] : null);

  if (!matchingEntry) {
    throw new OpenRouterApiError("OpenRouter key status is unavailable.", {
      status: response.status,
      detailMessage: "OpenRouter did not expose the active key in /keys.",
      infoUrl: OPENROUTER_KEYS_URL,
    });
  }

  return {
    label: normalizeErrorString(matchingEntry?.label) ?? null,
    name: normalizeErrorString(matchingEntry?.name) ?? null,
    limit: normalizeNullable(matchingEntry?.limit),
    limitRemaining: normalizeNullable(matchingEntry?.limit_remaining),
    limitReset: normalizeErrorString(matchingEntry?.limit_reset) ?? null,
    usage: normalize(matchingEntry?.usage),
  };
}