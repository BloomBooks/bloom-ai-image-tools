import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTPUT_GUESS,
  estimateImageRunCostUsd,
  estimateInputImageTokens,
  estimateOutputImageTokens,
  OUTPUT_TOKENS_BY_SIZE,
  PROMPT_TEXT_TOKEN_ALLOWANCE,
} from "../imageCostEstimate";

// Every figure here is a real call's own usage block, recorded in
// MODEL-COSTS.md (openai/gpt-image-2.5-flare via OpenRouter, 2026-09-14). The
// doc's "prompt tokens" column includes the ~127 text tokens of the prompt;
// the image-only figures below are that column minus 127.
const RATES = { textInputUsdPerMillion: 5, imageInputUsdPerMillion: 8, outputUsdPerMillion: 30 };
const PALETTE_PROMPT_TOKENS = 127;

describe("input image tokens", () => {
  it("bills one token per 32x32 patch plus ten across the ordinary range", () => {
    expect(estimateInputImageTokens({ width: 1024, height: 479 })).toBe(490);
    expect(estimateInputImageTokens({ width: 1088, height: 509 })).toBe(554);
    expect(estimateInputImageTokens({ width: 1152, height: 539 })).toBe(622);
    expect(estimateInputImageTokens({ width: 1216, height: 569 })).toBe(694);
    expect(estimateInputImageTokens({ width: 1280, height: 599 })).toBe(770);
    expect(estimateInputImageTokens({ width: 1408, height: 659 })).toBe(934);
    expect(estimateInputImageTokens({ width: 1536, height: 718 })).toBe(1114);
    expect(estimateInputImageTokens({ width: 1024, height: 1024 })).toBe(1034);
  });

  it("stops falling below a 1024 long edge, as the provider scales small images up", () => {
    expect(estimateInputImageTokens({ width: 512, height: 239 })).toBe(490);
    expect(estimateInputImageTokens({ width: 768, height: 359 })).toBe(490);
    expect(estimateInputImageTokens({ width: 512, height: 512 })).toBe(1034);
    // Scaled by at most 2x, so a tiny image does bill less.
    expect(estimateInputImageTokens({ width: 256, height: 120 })).toBe(138);
  });

  it("stops rising above roughly 1536 patches, as the provider scales huge images down", () => {
    expect(estimateInputImageTokens({ width: 2048, height: 958 })).toBe(1466);
    expect(estimateInputImageTokens({ width: 4096, height: 1916 })).toBe(1466);
    expect(estimateInputImageTokens({ width: 1536, height: 1536 })).toBe(1531);
    expect(estimateInputImageTokens({ width: 2048, height: 2048 })).toBe(1531);
  });

  it("is the same for either orientation", () => {
    expect(estimateInputImageTokens({ width: 479, height: 1024 })).toBe(490);
  });

  it("treats an unusable size as the default square", () => {
    expect(estimateInputImageTokens({ width: 0, height: 0 })).toBe(
      estimateInputImageTokens(DEFAULT_OUTPUT_GUESS),
    );
  });
});

describe("output image tokens", () => {
  it("returns the measured figure for a measured size, in either orientation", () => {
    for (const { size, tokens } of OUTPUT_TOKENS_BY_SIZE) {
      expect(estimateOutputImageTokens(size)).toBe(tokens);
      expect(estimateOutputImageTokens({ width: size.height, height: size.width })).toBe(tokens);
    }
    expect(estimateOutputImageTokens({ width: 1232, height: 544 })).toBe(75);
    expect(estimateOutputImageTokens({ width: 1024, height: 1024 })).toBe(196);
    expect(estimateOutputImageTokens({ width: 1536, height: 1024 })).toBe(158);
    expect(estimateOutputImageTokens({ width: 2048, height: 1536 })).toBe(247);
    expect(estimateOutputImageTokens({ width: 3072, height: 2048 })).toBe(365);
  });

  it("reads between the two measured sizes nearest in pixels for any other size", () => {
    // Between 1232x544 (670,208 px, 75) and 1024x1024 (1,048,576 px, 196).
    const between = estimateOutputImageTokens({ width: 1024, height: 840 });
    expect(between).toBeGreaterThan(75);
    expect(between).toBeLessThan(196);
    // Between 2048x1536 (247) and 3072x2048 (365).
    const larger = estimateOutputImageTokens({ width: 2560, height: 1920 });
    expect(larger).toBeGreaterThan(247);
    expect(larger).toBeLessThan(365);
  });

  it("holds flat beyond the smallest and largest measured sizes", () => {
    expect(estimateOutputImageTokens({ width: 800, height: 600 })).toBe(75);
    expect(estimateOutputImageTokens({ width: 3840, height: 2160 })).toBe(365);
  });
});

describe("cost of a call", () => {
  it("matches the palette generation with no reference to the cent", () => {
    const estimate = estimateImageRunCostUsd(
      RATES,
      [],
      { width: 1232, height: 544 },
      {
        promptTextTokens: PALETTE_PROMPT_TOKENS,
      },
    );
    expect(estimate.inputImageTokens).toBe(0);
    expect(estimate.outputTokens).toBe(75);
    expect(estimate.inputUsd).toBeCloseTo(0.000635, 6);
    expect(estimate.outputUsd).toBeCloseTo(0.00225, 6);
    expect(estimate.totalUsd).toBeCloseTo(0.002885, 6);
  });

  it("matches the same generation with one 1024px reference attached", () => {
    const estimate = estimateImageRunCostUsd(
      RATES,
      [{ width: 1024, height: 479 }],
      { width: 1232, height: 544 },
      { promptTextTokens: PALETTE_PROMPT_TOKENS },
    );
    expect(estimate.inputImageTokens).toBe(490);
    // This row's measured prompt cost was $0.004525, about four image tokens
    // under the rates every other row fits exactly; within a hundredth of a cent.
    expect(estimate.inputUsd).toBeCloseTo(0.004525, 4);
    expect(estimate.totalUsd).toBeCloseTo(0.006775, 4);
  });

  it("matches a 1536x1024 generation with no reference", () => {
    const estimate = estimateImageRunCostUsd(
      RATES,
      [],
      { width: 1536, height: 1024 },
      {
        promptTextTokens: PALETTE_PROMPT_TOKENS,
      },
    );
    expect(estimate.totalUsd).toBeCloseTo(0.005375, 6);
  });

  it("counts every reference in full: three 1024px references are 1597 prompt tokens", () => {
    const reference = { width: 1024, height: 479 };
    const estimate = estimateImageRunCostUsd(
      RATES,
      [reference, reference, reference],
      { width: 1024, height: 1536 },
      { promptTextTokens: PALETTE_PROMPT_TOKENS },
    );
    expect(estimate.inputImageTokens + estimate.promptTextTokens).toBe(1597);
    // 1470 image tokens at $8/M plus 127 text tokens at $5/M.
    expect(estimate.inputUsd).toBeCloseTo(0.012395, 6);
  });

  it("uses the prompt allowance and the default output size when told nothing else", () => {
    const estimate = estimateImageRunCostUsd(RATES, [], null);
    expect(estimate.promptTextTokens).toBe(PROMPT_TEXT_TOKEN_ALLOWANCE);
    expect(estimate.outputTokens).toBe(estimateOutputImageTokens(DEFAULT_OUTPUT_GUESS));
  });
});
