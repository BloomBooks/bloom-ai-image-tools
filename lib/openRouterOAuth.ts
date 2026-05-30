/**
 * OpenRouter OAuth PKCE flow for obtaining user-controlled API keys.
 * See: https://openrouter.ai/docs/guides/overview/auth/oauth
 */

const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/auth/keys";
const CODE_VERIFIER_KEY = "openrouter_code_verifier";

const setCodeVerifier = (verifier: string) => {
  sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);
  localStorage.setItem(CODE_VERIFIER_KEY, verifier);
};

const getCodeVerifier = () =>
  localStorage.getItem(CODE_VERIFIER_KEY) || sessionStorage.getItem(CODE_VERIFIER_KEY);

const clearCodeVerifier = () => {
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  localStorage.removeItem(CODE_VERIFIER_KEY);
};

const getCallbackUrl = (): string => {
  const callbackUrl = new URL(window.location.href);
  callbackUrl.searchParams.delete("code");
  return callbackUrl.toString();
};

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);

  const hashArray = new Uint8Array(hash);
  const base64 = btoa(String.fromCharCode(...hashArray));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build the OpenRouter authorization URL and persist the PKCE verifier,
 * WITHOUT navigating. Use this when the auth page should be opened somewhere
 * other than the current window — e.g. the host's default browser — and the
 * resulting code retrieved out-of-band (see `pollOAuthCodeFromBloomHost`).
 */
export async function buildOAuthAuthUrl(options?: { callbackUrl?: string }): Promise<string> {
  const codeVerifier = generateCodeVerifier();
  setCodeVerifier(codeVerifier);

  const codeChallenge = await createCodeChallenge(codeVerifier);

  const authUrl = new URL(OPENROUTER_AUTH_URL);
  authUrl.searchParams.set("callback_url", options?.callbackUrl || getCallbackUrl());
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return authUrl.toString();
}

/**
 * Initiate the OAuth PKCE flow by redirecting the current window to OpenRouter.
 * The callback URL defaults to the current page. (Standalone/browser flow.)
 */
export async function initiateOAuthFlow(options?: { callbackUrl?: string }): Promise<void> {
  const authUrl = await buildOAuthAuthUrl(options);
  window.location.href = authUrl;
}

export function getOAuthCodeFromUrl(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("code");
}

/**
 * Exchange the OAuth code for an API key.
 */
export async function exchangeCodeForApiKey(code: string): Promise<string> {
  const codeVerifier = getCodeVerifier();

  if (!codeVerifier) {
    throw new Error("No code verifier found. Please try the OAuth flow again.");
  }

  const cleanUrl = getCallbackUrl();

  let response: Response;
  try {
    response = await fetch(OPENROUTER_KEYS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        code_challenge_method: "S256",
      }),
    });
  } catch (err) {
    clearCodeVerifier();
    window.history.replaceState({}, document.title, cleanUrl);
    throw err;
  }

  clearCodeVerifier();
  window.history.replaceState({}, document.title, cleanUrl);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange code: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.key;
}

/**
 * Check for OAuth callback and handle the code exchange.
 * Returns the API key if successful, null if no OAuth callback is present.
 */
export async function handleOAuthCallback(): Promise<string | null> {
  const code = getOAuthCodeFromUrl();
  if (!code) {
    return null;
  }

  return exchangeCodeForApiKey(code);
}

export async function pollOAuthCodeFromBloomHost(
  httpBase: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<string> {
  const pollUrl = `${httpBase}/oauth-result?session=${encodeURIComponent(sessionToken)}`;

  while (!signal?.aborted) {
    const response = await fetch(pollUrl, { signal });
    if (!response.ok) {
      throw new Error(`Failed to check OAuth status: ${response.status}`);
    }

    const result = (await response.json()) as { code?: string | null; error?: string | null };
    if (result.error) {
      throw new Error(result.error);
    }

    if (result.code) {
      return result.code;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(resolve, 1000);
      if (!signal) {
        return;
      }

      const abortHandler = () => {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abortHandler);
        reject(new DOMException("OAuth polling aborted", "AbortError"));
      };

      signal.addEventListener("abort", abortHandler, { once: true });
    });
  }

  throw new DOMException("OAuth polling aborted", "AbortError");
}
