import { describe, expect, it } from "vite-plus/test";
import type { ModelInfo } from "../../types";
import {
  canUseLocalDummyModelWithoutApiKey,
  isLocalhostHostname,
  LOCAL_DUMMY_MODEL_ID,
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
});
