import { describe, expect, it } from "vitest";
import { onboardingLayout } from "./onboardingLayout";

describe("onboardingLayout", () => {
  it("places every zone on the 390 x 844 reference frame", () => {
    const layout = onboardingLayout({ width: 390, height: 844 });
    expect(layout.scale).toBe(1);
    expect(layout.side).toBe(24);
    expect(layout.title.top).toBe(120);
    expect(layout.title.bottom).toBeCloseTo(197, 5);
    expect(layout.subtitle.top).toBeCloseTo(217, 5);
    expect(layout.action.height).toBe(56);
    expect(layout.action.bottom).toBe(754);
    expect(layout.action.top).toBe(698);
    expect(layout.caption.top).toBe(778);
    expect(layout.caption.size).toBe(13);
  });

  it("keeps the centre object at 40% of the frame and centred in the gap", () => {
    const layout = onboardingLayout({ width: 390, height: 844 });
    expect(layout.centre.height).toBeCloseTo(337.6, 5);
    const above = layout.centre.top - (layout.subtitle.top + layout.subtitle.height);
    const below = layout.action.top - layout.centre.bottom;
    expect(above).toBeCloseTo(below, 5);
    expect(layout.centre.height / 844).toBeGreaterThanOrEqual(0.35);
    expect(layout.centre.height / 844).toBeLessThanOrEqual(0.45);
  });

  it("scales every value with width for a 360 x 780 frame", () => {
    const layout = onboardingLayout({ width: 360, height: 780 });
    const s = 360 / 390;
    expect(layout.scale).toBeCloseTo(s, 5);
    expect(layout.side).toBeCloseTo(24 * s, 5);
    expect(layout.title.top).toBeCloseTo(120 * s, 5);
    expect(layout.title.size).toBeCloseTo(35 * s, 5);
    expect(layout.action.height).toBeCloseTo(56 * s, 5);
    expect(layout.action.bottom).toBeCloseTo(780 - 90 * s, 5);
    expect(layout.caption.top).toBeCloseTo(780 - 90 * s + 24 * s, 5);
    const above = layout.centre.top - (layout.subtitle.top + layout.subtitle.height);
    const below = layout.action.top - layout.centre.bottom;
    expect(above).toBeCloseTo(below, 5);
    expect(layout.centre.height / 780).toBeCloseTo(0.4, 5);
  });
});
