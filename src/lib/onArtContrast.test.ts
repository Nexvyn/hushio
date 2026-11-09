import tokensCss from "../styles/tokens.css?raw";
import { describe, expect, it } from "vitest";

const lightBlock = /:root\[data-theme="light"\] \{[^}]*--on-art: 17 17 17;[^}]*\}/.exec(tokensCss)?.[0] ?? "";
const token = (name: string) => Number.parseFloat(new RegExp(`--${name}:\\s*([\\d.]+)`).exec(lightBlock)?.[1] ?? "NaN");

const ALPHA_SCALE = token("on-art-alpha");
const TRACK_ALPHA = token("on-art-track");
const INK = 17;
const BACKDROP_GREYS = [224, 230, 235];

function luminance(grey: number): number {
  const c = grey / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function contrast(a: number, b: number): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function onBackdrop(backdrop: number, alpha: number): number {
  const effective = Math.min(1, alpha * ALPHA_SCALE);
  return Math.round(backdrop * (1 - effective) + INK * effective);
}

describe("on-art light theme contrast", () => {
  it("reads the light token values", () => {
    expect(ALPHA_SCALE).toBeGreaterThan(1);
    expect(TRACK_ALPHA).toBeGreaterThan(0);
  });

  it("keeps secondary text at 4.5:1 or better on the whole light backdrop range", () => {
    for (const backdrop of BACKDROP_GREYS) {
      for (const alpha of [0.45, 0.55, 0.72]) {
        expect(contrast(onBackdrop(backdrop, alpha), backdrop)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps icons and the progress and volume tracks at 3:1 or better", () => {
    for (const backdrop of BACKDROP_GREYS) {
      const track = Math.round(backdrop * (1 - TRACK_ALPHA) + INK * TRACK_ALPHA);
      expect(contrast(track, backdrop)).toBeGreaterThanOrEqual(3);
      expect(contrast(onBackdrop(backdrop, 0.72), backdrop)).toBeGreaterThanOrEqual(3);
    }
  });
});
