import { describe, expect, it } from "vitest";
import { de } from "./de";
import { en } from "./en";
import { hi } from "./hi";

const catalogs = [
  ["Hindi", "hi", hi],
  ["German", "de", de],
] as const;

describe.each(catalogs)("%s translation catalog", (name, file, catalog) => {
  it(`has no ${name} key that is missing from en`, () => {
    const unknown = Object.keys(catalog).filter((key) => !(key in en));
    expect(unknown).toEqual([]);
  });

  it(`has no empty ${name} value`, () => {
    const empty = Object.entries(catalog).filter(([, value]) => typeof value !== "string" || value.trim() === "");
    expect(empty.map(([key]) => key)).toEqual([]);
  });

  it(`prints how many keys ${file}.ts has against en.ts`, () => {
    const total = Object.keys(en).length;
    const translated = Object.keys(catalog).length;
    const missing = Object.keys(en).filter((key) => !(key in catalog));
    console.info(`i18n: ${file}.ts has ${translated} of ${total} keys. Still in English: ${missing.join(", ") || "none"}`);
    expect(translated).toBeGreaterThan(0);
  });
});

describe("German placeholders", () => {
  it("keeps every {placeholder} that en uses, except the device noun", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    const mismatched = Object.entries(de)
      .filter(([key, value]) => {
        const source = en[key as keyof typeof en];
        const expected = placeholders(source).filter((name) => name !== "device");
        return JSON.stringify(placeholders(value as string)) !== JSON.stringify(expected);
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });
});
