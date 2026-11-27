import { describe, expect, it } from "vitest";
import { instant } from "./motion";
import { type Box, PICKER_MAX_HEIGHT, placePicker, pickerMotion } from "./pickerLayout";

const view = { width: 1200, height: 800 };
const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});

describe("placePicker", () => {
  it("centres the panel when there is no anchor", () => {
    expect(placePicker(null, view)).toEqual({ mode: "center", maxHeight: PICKER_MAX_HEIGHT, origin: "50% 50%" });
  });

  it("opens below a trigger with room, scaling from its top edge", () => {
    const placement = placePicker(box(100, 100, 40, 40), view);
    expect(placement).toMatchObject({ mode: "anchored", flipped: false, top: 148, origin: "top left" });
  });

  it("flips above a trigger near the bottom of the window and scales from its bottom edge", () => {
    const placement = placePicker(box(300, 700, 40, 40), view);
    expect(placement).toMatchObject({ mode: "anchored", flipped: true, origin: "bottom left" });
    expect(placement.mode === "anchored" && placement.bottom).toBe(800 - (700 - 8));
    expect(placement.mode === "anchored" && placement.top).toBeUndefined();
  });

  it("caps the height to the room on the chosen side", () => {
    const placement = placePicker(box(300, 560, 40, 40), { width: 1200, height: 700 });
    expect(placement.mode === "anchored" && placement.maxHeight).toBeLessThanOrEqual(700 - 16);
    expect(placement.mode === "anchored" && placement.maxHeight).toBeGreaterThanOrEqual(120);
  });

  it("aligns to the trigger's right edge when the trigger sits in the right half", () => {
    const placement = placePicker(box(1100, 300, 40, 40), view);
    expect(placement).toMatchObject({ origin: "top right" });
    expect(placement.mode === "anchored" && placement.left).toBe(1140 - 300);
  });

  it("keeps the panel inside the left and right edges", () => {
    const placement = placePicker(box(4, 300, 40, 40), { width: 320, height: 800 });
    expect(placement.mode === "anchored" && placement.left).toBe(8);
    const right = placePicker(box(300, 300, 40, 40), { width: 320, height: 800 });
    expect(right.mode === "anchored" && right.left).toBe(320 - 300 - 8);
  });
});

describe("pickerMotion", () => {
  it("opens from 0.95 with a fade and closes back to 0.95 in about 70% of the open time", () => {
    const motion = pickerMotion(false);
    expect(motion.initial).toEqual({ opacity: 0, scale: 0.95 });
    expect(motion.animate).toEqual({ opacity: 1, scale: 1 });
    expect(motion.exit).toMatchObject({ opacity: 0, scale: 0.95 });
    expect(motion.transition).toMatchObject({ duration: 0.175 });
    expect((motion.exit as { transition: { duration: number } }).transition.duration).toBe(0.12);
  });

  it("shows the picker immediately under Reduce Motion", () => {
    const motion = pickerMotion(true);
    expect(motion.initial).toBe(false);
    expect(motion.animate).toEqual({ opacity: 1 });
    expect(motion.exit).toBeUndefined();
    expect(motion.transition).toBe(instant);
  });
});
