import { describe, expect, it } from "vitest";
import { createSwipeNav, type SwipeWheel } from "./swipe";

function wheel(timeStamp: number, deltaX: number, deltaY = 0): SwipeWheel {
  return {
    deltaX,
    deltaY,
    deltaMode: 0,
    timeStamp,
    ctrlKey: false,
    defaultPrevented: false,
  };
}

const can = () => true;
const noScroll = () => false;

describe("swipe navigation", () => {
  it("commits a single back step past the line", () => {
    const swipe = createSwipeNav();

    expect(swipe.wheel(wheel(1000, -200), noScroll, can)).toMatchObject({
      kind: "track",
      dir: "back",
    });

    const armed = swipe.wheel(wheel(1050, -120), noScroll, can);
    expect(armed).toMatchObject({ kind: "track", dir: "back" });
    expect(armed && armed.kind === "track" && armed.progress).toBeGreaterThanOrEqual(1);

    expect(swipe.quiet(1050 + 150)).toEqual({ kind: "commit", dir: "back" });
    expect(swipe.quiet(1050 + 160)).toBeNull();
  });

  it("cancels a short swipe", () => {
    const swipe = createSwipeNav();
    expect(swipe.wheel(wheel(1000, -40), noScroll, can)).toMatchObject({
      kind: "track",
    });
    expect(swipe.quiet(1000 + 150)).toEqual({ kind: "cancel" });
  });

  it("ignores a new gesture right after a commit", () => {
    const swipe = createSwipeNav();
    swipe.wheel(wheel(1000, -400), noScroll, can);
    swipe.quiet(1150);

    expect(swipe.wheel(wheel(1200, -400), noScroll, can)).toBeNull();
    expect(
      swipe.wheel(wheel(1200 + 400, -400), noScroll, can),
    ).toMatchObject({ kind: "track" });
  });

  it("lets a sideways scroller win", () => {
    const swipe = createSwipeNav();
    expect(swipe.wheel(wheel(1000, -100), () => true, can)).toBeNull();
    expect(swipe.wheel(wheel(1050, -100), noScroll, can)).toBeNull();
  });

  it("flips direction when natural scrolling is off", () => {
    const swipe = createSwipeNav(() => -1);
    expect(swipe.wheel(wheel(1000, -400), noScroll, can)).toMatchObject({
      kind: "track",
      dir: "forward",
    });
  });

  it("arms the sidebar swipe at 50px", () => {
    const swipe = createSwipeNav();
    swipe.wheel(wheel(1000, -40), noScroll, can);
    const armed = swipe.wheel(wheel(1050, -20), noScroll, can);
    expect(armed && armed.kind === "track" && armed.progress).toBeGreaterThanOrEqual(1);
  });
});
