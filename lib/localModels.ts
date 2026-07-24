import type { ModelInfo } from "../types";

export const LOCAL_DUMMY_MODEL_ID = "debug/local-dummy-extract-cast";

export const LOCAL_DUMMY_MODEL: ModelInfo = {
  id: LOCAL_DUMMY_MODEL_ID,
  name: "Local Dummy (No AI)",
  badge: "Localhost Only",
  description:
    "Deterministic local test engine. On an edit tool it returns the target image tinted with a 'DUMMY EDIT' banner; with no target it returns a cast sheet. Never calls OpenRouter.",
  pricing: "Free on localhost",
  supportedAspectRatios: ["2:3", "3:4", "4:5", "9:16", "1:1", "5:4", "4:3", "3:2", "16:9"],
};

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const getRuntimeHostname = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.hostname || "";
};

export const isLocalhostHostname = (hostname: string | null | undefined) =>
  LOCALHOST_HOSTNAMES.has((hostname || "").trim().toLowerCase());

// When the editor is hosted (Bloom iframe), the host decides whether developer
// tools are exposed: the hosted shell calls setHostDeveloperToolsEnabled() with
// IBloomHostInitPayload.showDeveloperTools on every init. Hostname gating alone
// is not enough there — Bloom serves the editor from localhost even for real
// end users. null = standalone (no host verdict) → hostname gating applies.
let hostDeveloperToolsPreference: boolean | null = null;

export const setHostDeveloperToolsEnabled = (enabled: boolean | null) => {
  hostDeveloperToolsPreference = enabled;
};

/**
 * Whether the local dummy model should be offered in tool model pickers.
 * The dummy runs entirely in-browser but stays localhost-only regardless;
 * on localhost the host's preference (when hosted) is the deciding vote.
 */
export const isLocalDummyModelOffered = (hostname = getRuntimeHostname()) => {
  if (!isLocalhostHostname(hostname)) {
    return false;
  }
  return hostDeveloperToolsPreference ?? true;
};

export const withLocalModels = (
  models: ModelInfo[],
  hostname = getRuntimeHostname(),
): ModelInfo[] => {
  if (!isLocalhostHostname(hostname)) {
    return models;
  }

  if (models.some((model) => model.id === LOCAL_DUMMY_MODEL_ID)) {
    return models;
  }

  return [...models, LOCAL_DUMMY_MODEL];
};

export const canUseLocalDummyModelWithoutApiKey = (
  modelId: string | null | undefined,
  hostname = getRuntimeHostname(),
) => {
  const cleanModelId = (modelId || "").trim();
  return cleanModelId === LOCAL_DUMMY_MODEL_ID && isLocalhostHostname(hostname);
};
