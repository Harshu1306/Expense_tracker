import { describe, expect, it } from "vitest";
import {
  formatCompactINR,
  formatINR,
  paiseToInput,
  parseRupeesToPaise,
  percentOf,
  sumPaise,
} from "@/lib/money";

describe("money helpers (integer paise)", () => {
  it("formats Indian grouping without floating point drift", () => {
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(123456)).toBe("₹1,234.56");
    expect(formatINR(100000000)).toBe("₹10,00,000");
    expect(formatINR(-123456)).toBe("-₹1,234.56");
    expect(formatINR(123456, { showPaise: false })).toBe("₹1,234");
  });

  it("formats compact chart values", () => {
    expect(formatCompactINR(50000)).toBe("₹500");
    expect(formatCompactINR(1250000)).toBe("₹12.5k");
    expect(formatCompactINR(12500000)).toBe("₹1.3L");
    expect(formatCompactINR(1250000000)).toBe("₹1.3Cr");
  });

  it("parses rupee input exactly to paise", () => {
    expect(parseRupeesToPaise("0.10")).toBe(10);
    expect(parseRupeesToPaise("1")).toBe(100);
    expect(parseRupeesToPaise("1.5")).toBe(150);
    expect(parseRupeesToPaise("₹1,234.56")).toBe(123456);
    expect(parseRupeesToPaise(" 99.99 ")).toBe(9999);
  });

  it("rejects invalid, negative and over-precise amounts", () => {
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("0")).toBeNull();
    expect(parseRupeesToPaise("-10")).toBeNull();
    expect(parseRupeesToPaise("1.234")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(parseRupeesToPaise("1e5")).toBeNull();
  });

  it("round-trips paise to an editable rupee string", () => {
    expect(paiseToInput(10)).toBe("0.10");
    expect(paiseToInput(150)).toBe("1.50");
    expect(paiseToInput(100)).toBe("1");
    expect(paiseToInput(123456)).toBe("1234.56");
    expect(parseRupeesToPaise(paiseToInput(987654))).toBe(987654);
  });

  it("computes percentages and safe integer sums", () => {
    expect(percentOf(80, 100)).toBe(80);
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(10, 0)).toBe(0);
    expect(sumPaise([1, 2, 3.9, 4])).toBe(10);
  });
});
