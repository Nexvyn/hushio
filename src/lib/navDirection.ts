import { TABS, tabFor } from "./phoneNav";
import type { View } from "../stores/navigation";

export type NavSnapshot = { view: View; past: number; future: number };
export type NavDirection = "push" | "pop" | "tab" | "none";

function sameView(a: View, b: View): boolean {
  return a.name === b.name && a.param === b.param;
}

function isTabRoot(view: View): boolean {
  return TABS.some((tab) => sameView(tab.view, view));
}

export function navDirection(prev: NavSnapshot, next: NavSnapshot): NavDirection {
  if (next.past < prev.past) return "pop";
  if (sameView(prev.view, next.view)) return "none";
  if (next.past === prev.past) return "none";
  if (isTabRoot(next.view) && tabFor(prev.view) !== tabFor(next.view)) return "tab";
  return "push";
}
