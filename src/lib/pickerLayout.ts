import type { Target, TargetAndTransition, Transition } from "motion/react";
import { EASE_OUT, MS_FADE, MS_POPOVER_IN, MS_POPOVER_OUT } from "./motion";

export type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
export type View = { width: number; height: number };

export type Placement =
  | { mode: "center"; maxHeight: number; origin: string }
  | {
      mode: "anchored";
      left: number;
      top?: number;
      bottom?: number;
      origin: string;
      maxHeight: number;
      flipped: boolean;
    };

export const PICKER_WIDTH = 300;
export const PICKER_MAX_HEIGHT = 380;
const EDGE = 8;
const GAP = 8;
const MIN_HEIGHT = 120;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

export function placePicker(anchor: Box | null, view: View, width = PICKER_WIDTH): Placement {
  const maxHeight = Math.min(PICKER_MAX_HEIGHT, view.height - EDGE * 2);
  if (!anchor) return { mode: "center", maxHeight, origin: "50% 50%" };

  const spaceBelow = view.height - anchor.bottom - GAP - EDGE;
  const spaceAbove = anchor.top - GAP - EDGE;
  const flipped = spaceBelow < maxHeight && spaceAbove > spaceBelow;
  const room = flipped ? spaceAbove : spaceBelow;
  const alignRight = anchor.left + anchor.width / 2 > view.width / 2;
  const left = clamp(alignRight ? anchor.right - width : anchor.left, EDGE, view.width - width - EDGE);
  const origin = `${flipped ? "bottom" : "top"} ${alignRight ? "right" : "left"}`;
  const height = clamp(Math.min(maxHeight, room), MIN_HEIGHT, maxHeight);

  if (flipped) {
    return { mode: "anchored", left, bottom: view.height - (anchor.top - GAP), origin, maxHeight: height, flipped };
  }
  return { mode: "anchored", left, top: anchor.bottom + GAP, origin, maxHeight: height, flipped };
}

type PickerMotion = {
  initial: false | Target;
  animate: Target;
  exit?: TargetAndTransition;
  transition: Transition;
};

export function pickerMotion(reduced: boolean): PickerMotion {
  const transition = (duration: number): Transition => ({ duration: duration / 1000, ease: EASE_OUT });
  if (reduced) return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0, transition: transition(MS_FADE) },
    transition: transition(MS_FADE),
  };
  return {
    initial: { opacity: 0, scale: 0.96 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.98, transition: transition(MS_POPOVER_OUT) },
    transition: transition(MS_POPOVER_IN),
  };
}
