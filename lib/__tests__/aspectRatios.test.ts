import { describe, expect, it } from "vite-plus/test";
import {
  AUTO_ASPECT_RATIO,
  getClosestAspectRatioValue,
  getDefaultAspectRatioValue,
  getOpenAIOrientation,
  getAspectRatioPromptHint,
  resolveAspectRatioValue,
} from "../aspectRatios";

describe("aspect ratio helpers", () => {
  it("defaults scratch generation to square", () => {
    expect(resolveAspectRatioValue(undefined)).toBe("1:1");
  });

  it("resolves auto to the closest supported ratio", () => {
    expect(resolveAspectRatioValue(AUTO_ASPECT_RATIO, { width: 1536, height: 1024 })).toBe("3:2");
    expect(resolveAspectRatioValue(AUTO_ASPECT_RATIO, { width: 1080, height: 1920 })).toBe("9:16");
  });

  it("chooses the nearest extreme panoramic ratio", () => {
    expect(getClosestAspectRatioValue({ width: 3200, height: 800 })).toBe("4:1");
    expect(getClosestAspectRatioValue({ width: 800, height: 3200 })).toBe("1:4");
  });

  it("limits auto resolution to the selected model's supported ratios", () => {
    expect(getClosestAspectRatioValue({ width: 3200, height: 800 }, ["2:3", "1:1", "3:2"])).toBe(
      "3:2",
    );
  });

  it("falls back to a supported ratio when the current selection is unavailable", () => {
    expect(resolveAspectRatioValue("21:9", undefined, ["2:3", "1:1", "3:2"])).toBe("1:1");
    expect(getDefaultAspectRatioValue(["2:3", "3:2"])).toBe("2:3");
  });

  it("keeps the prompt hint aligned with the resolved supported ratio", () => {
    expect(getAspectRatioPromptHint("21:9", undefined, ["2:3", "1:1", "3:2"])).toContain(
      "1:1 aspect ratio",
    );
  });

  it("reduces explicit ratios to an OpenAI-compatible orientation bucket", () => {
    expect(getOpenAIOrientation("1:1")).toBe("square");
    expect(getOpenAIOrientation("21:9")).toBe("landscape");
    expect(getOpenAIOrientation("2:3")).toBe("portrait");
  });
});
