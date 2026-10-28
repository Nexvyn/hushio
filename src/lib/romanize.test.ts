import { describe, expect, it } from "vitest";
import { romanize } from "./romanize";

describe("romanize", () => {
  it.each([
    ["안녕하세요", "annyeonghaseyo"],
    ["한국어", "hangugeo"],
    ["감사합니다", "gamsahapnida"],
    ["괜찮아요", "gwaenchanayo"],
  ])("romanizes Hangul %s", (input, expected) => {
    expect(romanize(input)).toBe(expected);
  });

  it.each([
    ["ありがとう", "arigatou"],
    ["カタカナ", "katakana"],
    ["きょう", "kyou"],
    ["しゃしん", "shashin"],
    ["がっこう", "gakkou"],
    ["ラーメン", "raamen"],
  ])("romanizes kana %s", (input, expected) => {
    expect(romanize(input)).toBe(expected);
  });

  it.each([
    ["Привет", "Privet"],
    ["мир", "mir"],
    ["Щука", "Shchuka"],
  ])("romanizes Cyrillic %s", (input, expected) => {
    expect(romanize(input)).toBe(expected);
  });

  it("romanizes Devanagari with virama and vowel signs", () => {
    expect(romanize("नमस्ते")).toBe("namaste");
  });

  it("collapses whitespace in the reading", () => {
    expect(romanize("안녕   하세요")).toBe("annyeong haseyo");
  });

  it("returns null for lines with Han characters", () => {
    expect(romanize("漢字")).toBeNull();
    expect(romanize("今日はいい天気")).toBeNull();
  });

  it("returns null when nothing changes", () => {
    expect(romanize("Hello world")).toBeNull();
    expect(romanize("   ")).toBeNull();
    expect(romanize("")).toBeNull();
  });
});
