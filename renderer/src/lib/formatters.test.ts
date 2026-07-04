import { describe, expect, it } from "vitest";
import { formatVND, getLocalDateString, parseVND } from "./formatters";

describe("formatVND", () => {
  it("formats numbers as VND currency", () => {
    expect(formatVND(1_000_000)).toMatch(/1\.000\.000/);
    expect(formatVND(1_000_000)).toContain("₫");
  });

  it("treats null, undefined, and NaN as zero", () => {
    expect(formatVND(NaN)).toBe(formatVND(0));
    expect(formatVND(undefined as unknown as number)).toBe(formatVND(0));
    expect(formatVND(null as unknown as number)).toBe(formatVND(0));
  });
});

describe("parseVND", () => {
  it("parses plain numeric strings", () => {
    expect(parseVND("1234")).toBe(1234);
    expect(parseVND(5678)).toBe(5678);
  });

  it("parses thousand-separated values", () => {
    expect(parseVND("1.000.000")).toBe(1_000_000);
    expect(parseVND("1,234,567")).toBe(1_234_567);
  });

  it("returns zero for empty or invalid input", () => {
    expect(parseVND("")).toBe(0);
    expect(parseVND(null)).toBe(0);
    expect(parseVND(undefined)).toBe(0);
  });
});

describe("getLocalDateString", () => {
  it("returns an ISO date string in YYYY-MM-DD format", () => {
    expect(getLocalDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
