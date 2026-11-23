import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./hi", () => ({
  hi: {
    "nav.home": "होम",
    "count.songs.one": "{count} गाना",
    "count.songs.other": "{count} गाने",
  },
}));

import { applyLanguageSetting, currentLanguage, resolveLanguage, setLanguage, t, type TKey } from "./index";

const missing = "no.such.key" as TKey;

afterEach(() => setLanguage("en"));

describe("resolveLanguage", () => {
  it.each([
    ["en", undefined, "en"],
    ["hi", undefined, "hi"],
    ["system", ["hi-IN", "en-US"], "hi"],
    ["system", ["en-GB"], "en"],
    ["system", ["fr-FR", "es"], "en"],
    ["de", undefined, "de"],
    ["system", ["de-DE", "en-US"], "de"],
    ["system", ["fr-FR", "de-AT"], "de"],
    ["system", [], "en"],
    ["system", null, "en"],
    ["system", undefined, "en"],
    ["garbage", ["hi_IN"], "hi"],
    [undefined, ["hi"], "hi"],
    [null, undefined, "en"],
  ])("maps setting %s with locales %j to %s", (setting, locales, expected) => {
    expect(resolveLanguage(setting, locales)).toBe(expected);
  });

  it("applies the resolved language to the document", () => {
    applyLanguageSetting("hi");
    expect(currentLanguage()).toBe("hi");
    expect(document.documentElement.lang).toBe("hi");
  });
});

describe("setLanguage", () => {
  it("ignores codes that are not supported", () => {
    setLanguage("fr" as never);
    expect(currentLanguage()).toBe("en");
  });
});

describe("t", () => {
  it("returns the English text in English", () => {
    expect(t("nav.home")).toBe("Home");
  });

  it("uses the Hindi text when the key exists in Hindi", () => {
    setLanguage("hi");
    expect(t("nav.home")).toBe("होम");
  });

  it("falls back to English when Hindi has no value", () => {
    setLanguage("hi");
    expect(t("nav.back")).toBe("Back");
  });

  it("returns the key itself when it is missing everywhere, and never throws", () => {
    expect(t(missing)).toBe("no.such.key");
    expect(() => t(missing, { count: Number.NaN })).not.toThrow();
    setLanguage("hi");
    expect(t(missing, { count: 3 })).toBe("no.such.key");
  });

  it("interpolates named values and leaves unknown names alone", () => {
    expect(t("count.songs", { count: 5 })).toBe("5 songs");
    expect(t("count.songs.other")).toBe("{count} songs");
    expect(t("nav.back", { count: 2 })).toBe("Back");
  });

  it("chooses the English plural form by count", () => {
    expect(t("count.songs", { count: 1 })).toBe("1 song");
    expect(t("count.songs", { count: 0 })).toBe("0 songs");
    expect(t("count.songs", { count: 2 })).toBe("2 songs");
  });

  it("chooses the Hindi plural form by count", () => {
    setLanguage("hi");
    expect(t("count.songs", { count: 1 })).toBe("1 गाना");
    expect(t("count.songs", { count: 0 })).toBe("0 गाना");
    expect(t("count.songs", { count: 2 })).toBe("2 गाने");
  });
});
