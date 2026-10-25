import { describe, expect, it, vi } from "vitest";
import { displayLanguage, marketValue, normalizeCountry, resolveMarket, type MarketSignals } from "./market";

const signals = (overrides: Partial<MarketSignals> = {}): MarketSignals => ({
  isDev: false,
  override: undefined,
  region: undefined,
  timeZone: undefined,
  ...overrides,
});

describe("resolveMarket", () => {
  it("uses the dev override only in development builds", () => {
    expect(resolveMarket(signals({ isDev: true, override: "jp", region: "US" }))).toEqual({
      country: "JP",
      source: "override",
    });
    expect(resolveMarket(signals({ isDev: false, override: "JP", region: "US" }))).toEqual({
      country: "US",
      source: "os-region",
    });
  });

  it("ignores an override that is not a two-letter country", () => {
    expect(resolveMarket(signals({ isDev: true, override: "Japan", region: "DE" }))).toEqual({
      country: "DE",
      source: "os-region",
    });
  });

  it("prefers the OS region over the timezone", () => {
    expect(resolveMarket(signals({ region: " br ", timeZone: "Asia/Kolkata" }))).toEqual({
      country: "BR",
      source: "os-region",
    });
  });

  it("falls back to the timezone table, ignoring case", () => {
    expect(resolveMarket(signals({ timeZone: "Europe/Berlin" }))).toEqual({ country: "DE", source: "timezone" });
    expect(resolveMarket(signals({ timeZone: "America/New_York" }))).toEqual({ country: "US", source: "timezone" });
  });

  it("uses the default market for unknown zones and missing signals", () => {
    expect(resolveMarket(signals({ timeZone: "Etc/UTC" }))).toEqual({ country: "US", source: "default" });
    expect(resolveMarket(signals({ region: "USA" }))).toEqual({ country: "US", source: "default" });
    expect(resolveMarket(signals())).toEqual({ country: "US", source: "default" });
  });
});

describe("normalizeCountry", () => {
  it("accepts two ASCII letters after trim and uppercase", () => {
    expect(normalizeCountry("  in ")).toBe("IN");
  });

  it("rejects anything else", () => {
    expect(normalizeCountry("I")).toBeNull();
    expect(normalizeCountry("IN1")).toBeNull();
    expect(normalizeCountry("")).toBeNull();
    expect(normalizeCountry(42)).toBeNull();
    expect(normalizeCountry(undefined)).toBeNull();
  });
});

describe("displayLanguage", () => {
  it("takes the base language of the locale", () => {
    expect(displayLanguage("pt-BR")).toBe("pt");
    expect(displayLanguage("zh-Hant-TW")).toBe("zh");
    expect(displayLanguage("EN-us")).toBe("en");
  });

  it("falls back to English for invalid or missing locales", () => {
    expect(displayLanguage("")).toBe("en");
    expect(displayLanguage("123")).toBe("en");
    expect(displayLanguage(undefined)).toBe("en");
  });
});

describe("marketValue", () => {
  it("resolves once and returns a two-letter location", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const first = marketValue();
    const second = marketValue();

    expect(second).toBe(first);
    expect(first.location).toMatch(/^[A-Z]{2}$/);
    expect(first.lang).toMatch(/^[a-z]{2,3}$/);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^\[hushio\] market: [A-Z]{2} \((override|os-region|timezone|default)\)$/));
    info.mockRestore();
  });
});
