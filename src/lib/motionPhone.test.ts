import { describe, expect, it } from "vitest";
import {
  artPauseSpring,
  coverSnapSpring,
  fade,
  gate,
  instant,
  phoneBouncy,
  phoneSmooth,
  phoneSnappy,
  phoneTransition,
  phoneTween,
  pressIn,
  pressTap,
  scrubSpring,
  sheetSpring,
  DURATION_MS,
  PHONE_MS,
  EASE_OUT,
  INTRO_POP_EASE,
  nowPlayingEnter,
  phoneShared,
} from "./motion";

type Spring = { stiffness: number; damping: number; mass: number };

function dampingRatio(spring: Spring): number {
  return spring.damping / (2 * Math.sqrt(spring.stiffness * spring.mass));
}

describe("phone spring presets", () => {
  it("defines snappy, smooth and bouncy springs", () => {
    expect(phoneSnappy).toMatchObject({ type: "spring", stiffness: 420, damping: 36, mass: 1 });
    expect(phoneSmooth).toMatchObject({ type: "spring", stiffness: 260, damping: 30, mass: 1 });
    expect(phoneBouncy).toMatchObject({ type: "spring", stiffness: 380, damping: 29, mass: 1 });
  });

  it("keeps UI and gesture release springs near critical damping, without overshoot", () => {
    for (const spring of [phoneSnappy, phoneSmooth, sheetSpring, coverSnapSpring, artPauseSpring, scrubSpring]) {
      expect(dampingRatio(spring as Spring)).toBeGreaterThanOrEqual(0.85);
      expect(dampingRatio(spring as Spring)).toBeLessThanOrEqual(1.01);
    }
  });

  it("keeps the bounce spring for taps that carry a little momentum", () => {
    expect(dampingRatio(phoneBouncy as Spring)).toBeGreaterThan(0.7);
    expect(dampingRatio(phoneBouncy as Spring)).toBeLessThan(0.85);
  });

  it("uses the 120ms opacity fade as the reduced-motion variant of every preset", () => {
    for (const spring of [phoneSnappy, phoneSmooth, phoneBouncy]) {
      expect(phoneTransition(true, spring)).toBe(fade);
      expect(phoneTransition(false, spring)).toBe(spring);
    }
    expect(fade).toMatchObject({ duration: 0.12 });
  });

  it("gates a spring to an instant change under reduced motion", () => {
    expect(gate(true, sheetSpring)).toBe(instant);
    expect(gate(false, sheetSpring)).toBe(sheetSpring);
  });

  it("builds tweens from milliseconds", () => {
    expect(phoneTween(160)).toMatchObject({ duration: 0.16 });
  });
});

describe("press feedback", () => {
  it("starts the pressed state within 50ms", () => {
    expect(DURATION_MS.press).toBeLessThanOrEqual(50);
    expect(PHONE_MS.press).toBeLessThanOrEqual(50);
    expect(pressIn).toMatchObject({ duration: 0.05 });
  });

  it("uses one press scale for every tappable phone control", () => {
    expect(pressTap(false)).toMatchObject({ scale: 0.97, transition: pressIn });
  });

  it("drops the press effect under reduced motion", () => {
    expect(pressTap(true)).toBeUndefined();
  });
});

describe("shared motion aliases", () => {
  it("reuses the shared spring for the now playing entrance and the ease for the intro pop", () => {
    expect(nowPlayingEnter).toBe(phoneShared);
    expect(INTRO_POP_EASE).toBe(EASE_OUT);
  });

  it("keeps the cover like burst near 450 ms in total", () => {
    expect(PHONE_MS.likeHold + PHONE_MS.likeFade).toBeLessThanOrEqual(500);
    expect(PHONE_MS.likeHold + PHONE_MS.likeFade).toBeGreaterThanOrEqual(400);
    expect(PHONE_MS.likeBeat).toBe(120);
  });
});
