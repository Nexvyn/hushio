import { describe, expect, it } from "vitest";
import { appVolume, blendForOutput, eqForOutput, exclusiveActive, levelGain } from "./exclusive";

describe("exclusive output", () => {
  it("is active only when the setting is on and native audio is available", () => {
    expect(exclusiveActive(true, true)).toBe(true);
    expect(exclusiveActive(true, false)).toBe(false);
    expect(exclusiveActive(false, true)).toBe(false);
    expect(exclusiveActive(false, false)).toBe(false);
  });

  it("holds the app volume and the level trim at unity while on", () => {
    expect(appVolume(0.4, true)).toBe(1);
    expect(appVolume(0.4, false)).toBe(0.4);
    expect(levelGain(0.8, true)).toBe(1);
    expect(levelGain(0.8, false)).toBe(0.8);
  });

  it("bypasses the equalizer but keeps its gains for when it is turned off", () => {
    const eq = { enabled: true, gains: [3, 0, -2], autoHeadroom: true };
    expect(eqForOutput(eq, true)).toEqual({ ...eq, enabled: false });
    expect(eq.enabled).toBe(true);
    expect(eqForOutput(eq, false)).toBe(eq);
  });

  it("bypasses crossfade and smart fade", () => {
    const blend = { crossfadeSeconds: 6, smartFade: true };
    expect(blendForOutput(blend, true)).toEqual({ crossfadeSeconds: 0, smartFade: false });
    expect(blendForOutput(blend, false)).toBe(blend);
  });
});
