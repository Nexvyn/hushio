import { describe, expect, it } from "vitest";
import { normalizeCredit } from "./credits";

describe("normalizeCredit", () => {
  it("title-cases an all-caps credit and spaces the commas", () => {
    expect(normalizeCredit("ARIJEET SINGH,NEETI MOHAN, CHIRRANTAN BHATT")).toBe(
      "Arijeet Singh, Neeti Mohan, Chirrantan Bhatt",
    );
  });

  it("keeps mixed-case names as written and only fixes the comma gaps", () => {
    expect(normalizeCredit("Arijit Singh,Neeti Mohan")).toBe("Arijit Singh, Neeti Mohan");
    expect(normalizeCredit("DJ aqeel")).toBe("DJ aqeel");
  });

  it("collapses repeated spaces and trims", () => {
    expect(normalizeCredit("  Dua   Lipa  ")).toBe("Dua Lipa");
  });

  it("leaves strings without letters alone", () => {
    expect(normalizeCredit("1980 · 2024")).toBe("1980 · 2024");
    expect(normalizeCredit("")).toBe("");
  });
});
