import { describe, expect, it } from "vitest";
import {
  artPauseSpring,
  coverSnapSpring,
  fade,
  gate,
  instant,
  phoneSmooth,
  phoneSnappy,
  phoneTransition,
  phoneTween,
  pressIn,
  pressTap,
  scrubSpring,
  DURATION_MS,
  PHONE_MS,
  nowPlayingEnter,
  phoneShared,
  PRESS_SCALE,
} from "./motion";

type Spring = { stiffness: number; damping: number; mass: number };

function dampingRatio(spring: Spring): number {
  return spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
}

describe("phone spring presets", () => {
  it("defines snappy and smooth springs", () => {
    expect(phoneSnappy).toMatchObject({ type: "spring", stiffness: 440, damping: 42, mass: 1 });
    expect(phoneSmooth).toMatchObject({ type: "spring", stiffness: 300, damping: 35, mass: 1 });
  });

  it("keeps UI and gesture release springs near critical damping, without overshoot", () => {
    for (const spring of [phoneSnappy, phoneSmooth, coverSnapSpring, artPauseSpring, scrubSpring]) {
      expect(dampingRatio(spring as Spring)).toBeGreaterThanOrEqual(0.85);
      expect(dampingRatio(spring as Spring)).toBeLessThanOrEqual(1.02);
    }
  });

  it("uses the 120ms opacity fade as the reduced-motion variant of every preset", () => {
    for (const spring of [phoneSnappy, phoneSmooth]) {
      expect(phoneTransition(true, spring)).toBe(fade);
      expect(phoneTransition(false, spring)).toBe(spring);
    }
    expect(fade).toMatchObject({ duration: 0.12 });
  });

  it("gates a spring to an instant change under reduced motion", () => {
    expect(gate(true, phoneSmooth)).toBe(instant);
    expect(gate(false, phoneSmooth)).toBe(phoneSmooth);
  });

  it("builds tweens from milliseconds", () => {
    expect(phoneTween(160)).toMatchObject({ duration: 0.16 });
  });
});

describe("press feedback", () => {
  it("uses a 120ms press-in timing", () => {
    expect(DURATION_MS.press).toBe(120);
    expect(PHONE_MS.press).toBe(120);
    expect(pressIn).toMatchObject({ duration: 0.12 });
  });

  it("uses one press scale for every tappable phone control", () => {
    expect(pressTap(false)).toMatchObject({ scale: PRESS_SCALE, transition: pressIn });
  });

  it("drops the press effect under reduced motion", () => {
    expect(pressTap(true)).toBeUndefined();
  });
});

describe("shared motion aliases", () => {
  it("reuses the shared spring for the now playing entrance", () => {
    expect(nowPlayingEnter).toBe(phoneShared);
  });

  it("keeps the cover like burst near 450 ms in total", () => {
    expect(PHONE_MS.likeHold + PHONE_MS.likeFade).toBeLessThanOrEqual(500);
    expect(PHONE_MS.likeHold + PHONE_MS.likeFade).toBeGreaterThanOrEqual(400);
    expect(PHONE_MS.likeBeat).toBe(120);
  });
});
