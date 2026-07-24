import { afterEach, describe, expect, it } from "vite-plus/test";
import type { ModelInfo } from "../../types";
import {
  canUseLocalDummyModelWithoutApiKey,
  isLocalDummyModelOffered,
  isLocalhostHostname,
  LOCAL_DUMMY_MODEL_ID,
  setHostDeveloperToolsEnabled,
  withLocalModels,
} from "../localModels";

const BASE_MODELS: ModelInfo[] = [
  {
    id: "example/remote-model",
    name: "Remote Model",
    description: "Remote only",
    pricing: "$1",
  },
];

describe("local dummy models", () => {
  it("recognizes localhost hostnames", () => {
    expect(isLocalhostHostname("localhost")).toBe(true);
    expect(isLocalhostHostname("127.0.0.1")).toBe(true);
    expect(isLocalhostHostname("::1")).toBe(true);
    expect(isLocalhostHostname("example.com")).toBe(false);
  });

  it("adds the local dummy model only on localhost", () => {
    expect(withLocalModels(BASE_MODELS, "example.com")).toHaveLength(1);

    const localhostModels = withLocalModels(BASE_MODELS, "localhost");
    expect(localhostModels).toHaveLength(2);
    expect(localhostModels.some((model) => model.id === LOCAL_DUMMY_MODEL_ID)).toBe(true);
  });

  it("allows the dummy model without an api key only on localhost", () => {
    expect(canUseLocalDummyModelWithoutApiKey(LOCAL_DUMMY_MODEL_ID, "localhost")).toBe(true);
    expect(canUseLocalDummyModelWithoutApiKey(LOCAL_DUMMY_MODEL_ID, "example.com")).toBe(false);
    expect(canUseLocalDummyModelWithoutApiKey("example/remote-model", "localhost")).toBe(false);
  });

  describe("developer-tools gating of the dummy model offering", () => {
    afterEach(() => {
      // Module-level host preference must not leak between tests.
      setHostDeveloperToolsEnabled(null);
    });

    it("standalone (no host verdict): offered on localhost only", () => {
      expect(isLocalDummyModelOffered("localhost")).toBe(true);
      expect(isLocalDummyModelOffered("example.com")).toBe(false);
    });

    it("hosted: the host's showDeveloperTools verdict decides", () => {
      setHostDeveloperToolsEnabled(false);
      expect(isLocalDummyModelOffered("localhost")).toBe(false);

      setHostDeveloperToolsEnabled(true);
      expect(isLocalDummyModelOffered("localhost")).toBe(true);
    });

    it("never offered off localhost, even if the host opts in", () => {
      setHostDeveloperToolsEnabled(true);
      expect(isLocalDummyModelOffered("example.com")).toBe(false);
    });
  });
});
