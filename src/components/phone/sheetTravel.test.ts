import { afterEach, describe, expect, it } from "vitest";
import { coverFlight, coverRadiusOf, glideSheet, heldBox, miniFadeOf, mountSheet, opennessOf, pageCardOf, settleSheet, sheetClipOf, sheetProgressOf, sheetRadiusOf, sheetWashOf, sheetY, textBlurOf, textFadeOf, titleFadeOf, titleRevealOf, travelPx, unmountSheet, watchSheetInterruptions, type Geometry } from "./sheetTravel";
import { useUI } from "../../stores/ui";

const geometry: Geometry = { from: { top: 700, left: 12, size: 40 }, to: { top: 120, left: 24, size: 320 } };

function hide() {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  unmountSheet();
  useUI.setState({ nowPlayingOpen: false });
});

describe("sheet travel", () => {
  it("starts the cover exactly on the mini player thumb and lands on the big cover", () => {
    const start = coverFlight(geometry, 0);
    expect(start.scale).toBeCloseTo(40 / 320);
    expect(geometry.to.top + start.y).toBeCloseTo(geometry.from.top);
    expect(geometry.to.left + start.x).toBeCloseTo(geometry.from.left);
    const end = coverFlight(geometry, 1);
    expect([end.x + 0, end.y + 0, end.scale]).toEqual([0, 0, 1]);
  });

  it("moves the cover linearly with the sheet so both land together", () => {
    const p = 0.5;
    const flight = coverFlight(geometry, p);
    expect(geometry.to.top + flight.y).toBeCloseTo((geometry.from.top + geometry.to.top) / 2);
    expect(flight.scale).toBeCloseTo((40 / 320 + 1) / 2);
  });

  it("rounds the cover from a circle to its resting corner", () => {
    expect(coverRadiusOf(geometry, 0)).toBe(160);
    expect(coverRadiusOf(geometry, 1)).toBe(12);
    expect(coverRadiusOf(null, 0)).toBe(12);
  });

  it("widens the thumb box so a paused cover still lands on the thumb", () => {
    const held = heldBox({ top: 100, left: 10, size: 43 }, 0.86);
    expect(held.size * 0.86).toBeCloseTo(43);
    expect(held.top + held.size / 2).toBeCloseTo(100 + 43 / 2);
    expect(heldBox(geometry.from, 1)).toBe(geometry.from);
  });

  it("fades the mini player row out over the first 30% of the travel", () => {
    expect(miniFadeOf(0)).toBe(1);
    expect(miniFadeOf(0.15)).toBeCloseTo(0.5);
    expect(miniFadeOf(0.3)).toBe(0);
  });

  it("maps sheet position to one clamped progress value", () => {
    expect(sheetProgressOf(800, 800)).toBe(0);
    expect(sheetProgressOf(400, 800)).toBe(0.5);
    expect(sheetProgressOf(0, 800)).toBe(1);
    expect(sheetProgressOf(-20, 800)).toBe(1);
    expect(sheetProgressOf(820, 800)).toBe(0);
  });

  it("expands the sheet clip from the mini bar to the full screen", () => {
    const bounds = { top: 680, left: 8, width: 384, height: 64 };
    expect(sheetClipOf(bounds, 400, 800, 0)).toEqual({ top: 680, right: 8, bottom: 56, left: 8, radius: 14 });
    expect(sheetClipOf(bounds, 400, 800, 0.5).top).toBe(340);
    expect(sheetClipOf(bounds, 400, 800, 1)).toEqual({ top: 0, right: 0, bottom: 0, left: 0, radius: 0 });
  });

  it("keeps only fade motion when reduced motion is active", () => {
    expect(sheetClipOf({ top: 680, left: 8, width: 384, height: 64 }, 400, 800, 0.4, true)).toEqual({ top: 0, right: 0, bottom: 0, left: 0, radius: 0 });
    expect(pageCardOf(1, true)).toEqual({ scale: 1, radius: 0, shade: 0 });
  });

  it("fades full player text and controls in only over the last 30% of the travel", () => {
    expect(titleFadeOf(0.7)).toBe(0);
    expect(titleFadeOf(0.85)).toBeCloseTo(0.5);
    expect(titleFadeOf(1)).toBe(1);
  });

  it("keeps the sheet wash opaque until the mini player row has faded in", () => {
    expect(sheetWashOf(0)).toBe(0);
    expect(sheetWashOf(0.15)).toBeCloseTo(0.5);
    expect(sheetWashOf(0.3)).toBe(1);
    expect(sheetWashOf(1)).toBe(1);
  });

  it("interpolates the cover rect from the mini thumb to the big cover", () => {
    const rect = (p: number) => {
      const f = coverFlight(geometry, p);
      return { top: geometry.to.top + f.y, left: geometry.to.left + f.x, size: geometry.to.size * f.scale };
    };
    expect(rect(0)).toEqual({ top: geometry.from.top, left: geometry.from.left, size: geometry.from.size });
    expect(rect(1)).toEqual(geometry.to);
    const mid = rect(0.5);
    expect(mid.top).toBeCloseTo((geometry.from.top + geometry.to.top) / 2);
    expect(mid.left).toBeCloseTo((geometry.from.left + geometry.to.left) / 2);
    expect(mid.size).toBeCloseTo((geometry.from.size + geometry.to.size) / 2);
  });

  it("scales, rounds and dims the page with the sheet and leaves it untouched under reduced motion", () => {
    expect(pageCardOf(0, false)).toEqual({ scale: 1, radius: 0, shade: 0 });
    const open = pageCardOf(1, false);
    expect(open.scale).toBeCloseTo(0.94);
    expect(open.radius).toBe(12);
    expect(open.shade).toBeCloseTo(0.4);
    expect(pageCardOf(1, true)).toEqual({ scale: 1, radius: 0, shade: 0 });
  });

  it("rounds the sheet corners while travelling and squares them as it reaches the top", () => {
    expect(sheetRadiusOf(0)).toBe(16);
    expect(sheetRadiusOf(0.85)).toBe(16);
    expect(sheetRadiusOf(0.925)).toBeCloseTo(8);
    expect(sheetRadiusOf(1)).toBe(0);
  });

  it("covers the full height at rest with square corners and no lift", () => {
    sheetY.set(0);
    expect(opennessOf(sheetY.get())).toBe(1);
    expect(sheetRadiusOf(opennessOf(sheetY.get()))).toBe(0);
    expect(Math.max(0, sheetY.get())).toBe(0);
  });

  it("clamps openness so a spring overshoot never pushes the page past its card", () => {
    expect(opennessOf(-50)).toBe(1);
    expect(opennessOf(travelPx() + 50)).toBe(0);
  });
});

describe("interrupted sheet travel", () => {
  it("finishes a close at once when the screen goes off mid-animation", () => {
    const stop = watchSheetInterruptions();
    useUI.setState({ nowPlayingOpen: true });
    mountSheet();
    sheetY.set(travelPx() / 2);
    glideSheet(travelPx(), 0, () => useUI.getState().closeNowPlaying());
    hide();
    stop();
    expect(useUI.getState().nowPlayingOpen).toBe(false);
    expect(sheetY.get()).toBe(travelPx());
    expect(pageCardOf(opennessOf(sheetY.get()), false)).toEqual({ scale: 1, radius: 0, shade: 0 });
  });

  it("finishes an open at once when the page is hidden mid-animation", () => {
    useUI.setState({ nowPlayingOpen: true });
    mountSheet();
    sheetY.set(travelPx() / 2);
    glideSheet(0, 0);
    settleSheet();
    expect(sheetY.get()).toBe(0);
  });

  it("never pulls the page back into a card once the sheet is gone", () => {
    useUI.setState({ nowPlayingOpen: true });
    mountSheet();
    unmountSheet();
    useUI.setState({ nowPlayingOpen: false });
    glideSheet(0, 0);
    settleSheet();
    expect(sheetY.get()).toBe(travelPx());
  });
});

describe("drag text fades", () => {
  it("fades the mini title out with a blur over the first quarter of the drag", () => {
    expect(textFadeOf(0)).toBe(1);
    expect(textFadeOf(0.125)).toBeCloseTo(0.5);
    expect(textFadeOf(0.25)).toBe(0);
    expect(textFadeOf(0.6)).toBe(0);
    expect(textBlurOf(0, false)).toBe("blur(0.00px)");
    expect(textBlurOf(1 - textFadeOf(0.25), false)).toBe("blur(4.00px)");
  });

  it("reveals the Now Playing title only near the end of the drag", () => {
    expect(titleRevealOf(0.7)).toBe(0);
    expect(titleRevealOf(0.85)).toBeCloseTo(0.5);
    expect(titleRevealOf(1)).toBe(1);
  });

  it("drops the blur under reduced motion", () => {
    expect(textBlurOf(1, true)).toBe("none");
  });
});
