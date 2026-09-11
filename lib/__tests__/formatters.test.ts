import { describe, expect, it } from "vitest";
import { formatCost } from "../formatters";

describe("formatCost", () => {
  it("shows a cent or more to the cent", () => {
    expect(formatCost(0.0281)).toBe("$0.03");
    expect(formatCost(0.14)).toBe("$0.14");
    expect(formatCost(0.2248)).toBe("$0.22");
    expect(formatCost(0.01)).toBe("$0.01");
  });

  it("shows less than a cent to a tenth of a cent", () => {
    // A GPT Image 2.5 generation lands here; "$0.01" would hide how cheap it is.
    expect(formatCost(0.0064)).toBe("$0.006");
    expect(formatCost(0.0096)).toBe("$0.010");
    expect(formatCost(0.001)).toBe("$0.001");
  });

  it("does not round a real cost down to nothing", () => {
    expect(formatCost(0.0004)).toBe("<$0.001");
  });

  it("shows nothing spent as zero", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(null)).toBe("$0.00");
    expect(formatCost(Number.NaN)).toBe("$0.00");
  });
});
