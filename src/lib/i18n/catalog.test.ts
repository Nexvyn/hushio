import { describe, expect, it } from "vitest";
import { en } from "./en";
import { hi } from "./hi";

describe("translation catalogs", () => {
  it("has no Hindi key that is missing from en", () => {
    const unknown = Object.keys(hi).filter((key) => !(key in en));
    expect(unknown).toEqual([]);
  });

  it("has no empty Hindi value", () => {
    const empty = Object.entries(hi).filter(([, value]) => typeof value !== "string" || value.trim() === "");
    expect(empty.map(([key]) => key)).toEqual([]);
  });

  it("prints how many keys hi.ts has against en.ts", () => {
    const total = Object.keys(en).length;
    const translated = Object.keys(hi).length;
    const missing = Object.keys(en).filter((key) => !(key in hi));
    console.info(`i18n: hi.ts has ${translated} of ${total} keys. Still in English: ${missing.join(", ") || "none"}`);
    expect(translated).toBeGreaterThan(0);
  });
});
