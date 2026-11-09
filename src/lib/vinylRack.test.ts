import { describe, expect, it } from "vitest";
import { rackLayout, rackNeighbours, rackSlotShown, rackSpan, rackStyle, rubberBandPosition, snapDirection } from "./vinylRack";
import type { Track } from "../types";

const track = (id: string): Track => ({ id, title: `Track ${id}`, artist: "A", thumb: null });

describe("rackLayout", () => {
  it("sizes the centre cover to 60% of the column up to 420px", () => {
    expect(rackLayout(300).centre).toBe(180);
    expect(rackLayout(600).centre).toBe(360);
    expect(rackLayout(900).centre).toBe(420);
  });

  it("keeps every cover inside the container for a range of widths", () => {
    for (const width of [240, 320, 400, 520, 640, 760, 1000]) {
      const layout = rackLayout(width);
      for (const distance of [0, 1, 2] as const) {
        const span = rackSpan(layout, distance);
        expect(width / 2 + span.min).toBeGreaterThanOrEqual(0);
        expect(width / 2 + span.max).toBeLessThanOrEqual(width);
      }
    }
  });

  it("shows exactly the tuck strip of each side cover beyond the one in front", () => {
    for (const width of [640, 900, 1200]) {
      const layout = rackLayout(width);
      expect(rackSpan(layout, 1).max - layout.centre / 2).toBeCloseTo(70, 0);
      expect(rackSpan(layout, 2).max - rackSpan(layout, 1).max).toBeCloseTo(40, 0);
    }
  });

  it("tucks each side cover behind the one in front of it", () => {
    const layout = rackLayout(640);
    expect(rackSpan(layout, 1).min).toBeLessThan(layout.centre / 2);
    expect(rackSpan(layout, 2).max).toBeGreaterThan(rackSpan(layout, 1).max);
  });

  it("scales the side covers 0.78 and 0.66 and dims the outer one", () => {
    const layout = rackLayout(640);
    expect(layout.keys[1].scale).toBe(0.78);
    expect(layout.keys[2].scale).toBe(0.66);
    expect(layout.keys[2].opacity).toBe(0.55);
  });

  it("hides a side cover whose size would fall below 96px", () => {
    const narrow = rackLayout(200);
    expect(rackSlotShown(narrow, -1)).toBe(false);
    expect(rackSlotShown(narrow, -2)).toBe(false);
    expect(rackSlotShown(narrow, 1)).toBe(false);
    expect(rackSlotShown(narrow, 0)).toBe(true);
    const wide = rackLayout(640);
    expect(rackSlotShown(wide, -2)).toBe(true);
    expect(rackSlotShown(wide, 1)).toBe(true);
  });
});

describe("rackStyle", () => {
  const layout = rackLayout(640);

  it("centres the current cover at full size with no rotation", () => {
    expect(rackStyle(0, layout)).toMatchObject({ transform: "translateX(0px) rotateY(0deg) scale(1)", filter: "brightness(1)", opacity: 1 });
  });

  it("turns the right neighbour away and the left one the other way", () => {
    expect(rackStyle(1, layout).transform).toContain("rotateY(-42deg)");
    expect(rackStyle(-1, layout).transform).toContain("rotateY(42deg)");
    expect(rackStyle(1, layout).transform.startsWith(`translateX(${layout.keys[1].x}px)`)).toBe(true);
    expect(rackStyle(-1, layout).transform.startsWith(`translateX(${-layout.keys[1].x}px)`)).toBe(true);
  });

  it("interpolates between slots while dragging", () => {
    expect(rackStyle(-0.5, layout).opacity).toBe(1);
    expect(rackStyle(-1.5, layout).opacity).toBeCloseTo(0.775);
  });

  it("stacks the centre cover above the sides", () => {
    expect(rackStyle(0, layout).zIndex).toBeGreaterThan(rackStyle(-1, layout).zIndex);
    expect(rackStyle(-1, layout).zIndex).toBeGreaterThan(rackStyle(-2, layout).zIndex);
  });
});

describe("rackNeighbours", () => {
  const queue = ["a", "b", "c", "d", "e"].map(track);

  it("returns two previous, the current and one next when they exist", () => {
    const slots = rackNeighbours(queue, 2).map(({ slot, track: item }) => [slot, item.id]);
    expect(slots).toEqual([
      [-2, "a"],
      [-1, "b"],
      [0, "c"],
      [1, "d"],
    ]);
  });

  it("omits missing slots at the ends", () => {
    expect(rackNeighbours(queue, 0).map((item) => item.slot)).toEqual([0, 1]);
    expect(rackNeighbours(queue, 4).map((item) => item.slot)).toEqual([-2, -1, 0]);
    expect(rackNeighbours([], 0)).toEqual([]);
  });
});

describe("snapDirection", () => {
  const both = { canPrev: true, canNext: true };

  it("stays on the current cover for small drags and slow releases", () => {
    expect(snapDirection({ offset: 0.2, velocity: 0, ...both })).toBe(0);
    expect(snapDirection({ offset: -0.3, velocity: -0.2, ...both })).toBe(0);
  });

  it("moves to a neighbour past about a third of a slot", () => {
    expect(snapDirection({ offset: 0.4, velocity: 0, ...both })).toBe(1);
    expect(snapDirection({ offset: -0.4, velocity: 0, ...both })).toBe(-1);
  });

  it("moves on a fast flick even when the drag was short", () => {
    expect(snapDirection({ offset: 0.1, velocity: 1.2, ...both })).toBe(1);
    expect(snapDirection({ offset: -0.1, velocity: -1.2, ...both })).toBe(-1);
  });

  it("does not let a flick back cancel a drag forward", () => {
    expect(snapDirection({ offset: 0.1, velocity: -1.2, ...both })).toBe(0);
  });

  it("never moves past an end that has no track", () => {
    expect(snapDirection({ offset: 0.6, velocity: 2, canPrev: true, canNext: false })).toBe(0);
    expect(snapDirection({ offset: -0.6, velocity: -2, canPrev: false, canNext: true })).toBe(0);
  });
});

describe("rubberBandPosition", () => {
  it("passes values inside the range through", () => {
    expect(rubberBandPosition(0.5, -1, 1)).toBe(0.5);
  });

  it("resists past an end and never goes further than one slot", () => {
    const past = rubberBandPosition(1.5, -1, 1);
    expect(past).toBeGreaterThan(1);
    expect(past).toBeLessThan(1.5);
    expect(rubberBandPosition(-100, -1, 1)).toBeGreaterThan(-2);
  });
});
