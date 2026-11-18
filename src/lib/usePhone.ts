import { platform } from "./bridge";
import { shellFor, useShortSide } from "./layoutTier";

export function usePhone(): boolean {
  const shortSide = useShortSide();
  return platform === "android" && shellFor(shortSide) === "phone";
}
