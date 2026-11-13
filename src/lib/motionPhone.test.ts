import { describe, expect, it } from "vitest";
import { fade, phoneBouncy, phoneSmooth, phoneSnappy, phoneTransition, phoneTween } from "./motion";

describe("phone spring presets", () => {
  it("defines snappy, smooth and bouncy springs", () => {
    expect(phoneSnappy).toMatchObject({ type: "spring", stiffness: 420, damping: 36, mass: 1 });
    expect(phoneSmooth).toMatchObject({ type: "spring", stiffness: 260, damping: 30, mass: 1 });
    expect(phoneBouncy).toMatchObject({ type: "spring", stiffness: 380, damping: 22, mass: 1 });
  });

  it("uses the 120ms opacity fade as the reduced-motion variant of every preset", () => {
    for (const spring of [phoneSnappy, phoneSmooth, phoneBouncy]) {
      expect(phoneTransition(true, spring)).toBe(fade);
      expect(phoneTransition(false, spring)).toBe(spring);
    }
    expect(fade).toMatchObject({ duration: 0.12 });
  });

  it("builds tweens from milliseconds", () => {
    expect(phoneTween(160)).toMatchObject({ duration: 0.16 });
  });
});
