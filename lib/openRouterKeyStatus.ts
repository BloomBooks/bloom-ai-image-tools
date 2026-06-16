import {
  fetchOpenRouterCredits,
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
  // Account-level credit balance from the /credits endpoint. This is the
  // total credits purchased/granted to the account (independent of any
  // per-key spend limit). Null when the balance could not be retrieved.
  accountTotalCredits: number | null;
  accountRemainingCredits: number | null;
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

  // Fetch the per-key status and the account-level credit balance in
  // parallel. The balance is best-effort: a key with no per-key limit has no
  // meaningful "remaining" of its own, so we fall back to the account balance
  // to give the credits gauge something real to display.
  const [response, accountCredits] = await Promise.all([
    fetch(`${OPENROUTER_BASE_URL}/key`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": window.location.origin,
        "X-Title": "Bloom AI Image Tools",
      },
      signal: options?.signal,
    }),
    fetchOpenRouterCredits(key, { signal: options?.signal }).catch(() => null),
  ]);

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
    accountTotalCredits: accountCredits ? accountCredits.totalCredits : null,
    accountRemainingCredits: accountCredits ? accountCredits.remainingCredits : null,
  };
}
