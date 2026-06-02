import { OPENROUTER_KEYS_URL, OpenRouterApiError } from "../services/openRouterService";

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

export async function fetchOpenRouterKeyStatus(
  apiKey: string,
  options?: FetchOpenRouterKeyStatusOptions,
): Promise<OpenRouterKeyStatus> {
  const key = apiKey?.trim();
  if (!key) {
    throw new Error("OpenRouter API key is missing. Connect to OpenRouter to continue.");
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/key`, {
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
      `Failed to fetch OpenRouter key status: ${response.status} ${preview}`,
      {
        status: response.status,
        detailMessage,
        infoUrl: OPENROUTER_KEYS_URL,
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

  const entry: Record<string, unknown> = (data?.data ?? {}) as Record<string, unknown>;

  return {
    label: normalizeErrorString(entry.label) ?? null,
    name: normalizeErrorString(entry.name) ?? null,
    limit: normalizeNullable(entry.limit),
    limitRemaining: normalizeNullable(entry.limit_remaining),
    limitReset: normalizeErrorString(entry.limit_reset) ?? null,
    usage: normalize(entry.usage),
  };
}
