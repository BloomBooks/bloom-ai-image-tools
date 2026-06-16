import type { ModelInfo } from "../types";

export const LOCAL_DUMMY_MODEL_ID = "debug/local-dummy-extract-cast";

export const LOCAL_DUMMY_MODEL: ModelInfo = {
  id: LOCAL_DUMMY_MODEL_ID,
  name: "Local Dummy Extract Cast",
  badge: "Localhost Only",
  description:
    "Deterministic local test model that returns a cast sheet for split-image testing without calling OpenRouter.",
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
