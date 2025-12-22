/**
 * OpenRouter OAuth PKCE flow for obtaining user-controlled API keys.
 * See: https://openrouter.ai/docs/guides/overview/auth/oauth
 */

const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
const OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/auth/keys";
const CODE_VERIFIER_KEY = "openrouter_code_verifier";

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
 * Initiate the OAuth PKCE flow by redirecting the user to OpenRouter.
 * The callback URL will be the current page.
 */
export async function initiateOAuthFlow(): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);

  const codeChallenge = await createCodeChallenge(codeVerifier);

  const callbackUrl = window.location.origin + window.location.pathname;
  const authUrl = new URL(OPENROUTER_AUTH_URL);
  authUrl.searchParams.set("callback_url", callbackUrl);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  window.location.href = authUrl.toString();
}

export function getOAuthCodeFromUrl(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get("code");
}

/**
 * Exchange the OAuth code for an API key.
 */
export async function exchangeCodeForApiKey(code: string): Promise<string> {
  const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);

  if (!codeVerifier) {
    throw new Error("No code verifier found. Please try the OAuth flow again.");
  }

  const response = await fetch(OPENROUTER_KEYS_URL, {
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to exchange code: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  sessionStorage.removeItem(CODE_VERIFIER_KEY);

  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);

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
