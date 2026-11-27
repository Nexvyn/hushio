import { describe, expect, it } from "vitest";
import { toggleKeyframes, type ToggleKind } from "./toggleMotion";

const KINDS: ToggleKind[] = ["shuffle", "repeat", "like"];
const STATES = ["on", "off", "all", "one"];

describe("toggleKeyframes", () => {
  it("returns null for every toggle when reduced motion is on", () => {
    for (const kind of KINDS) {
      for (const state of STATES) {
        expect(toggleKeyframes(kind, state, true), `${kind}:${state}`).toBeNull();
      }
    }
  });

  it("never overshoots 1 on any keyframe", () => {
    for (const kind of KINDS) {
      for (const state of STATES) {
        const plan = toggleKeyframes(kind, state, false);
        if (!plan) continue;
        for (const value of plan.values) expect(value, `${kind}:${state}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("gives shuffle and repeat no keyframes", () => {
    expect(toggleKeyframes("shuffle", "on", false)).toBeNull();
    expect(toggleKeyframes("repeat", "all", false)).toBeNull();
  });

  it("settles the like heart by a tiny scale only when liked", () => {
    expect(toggleKeyframes("like", "on", false)?.values).toEqual([0.96, 1]);
    expect(toggleKeyframes("like", "off", false)).toBeNull();
  });
});
