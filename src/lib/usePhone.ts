import { platform } from "./bridge";
import { shellFor, useViewportWidth } from "./layoutTier";

export function usePhone(): boolean {
  const width = useViewportWidth();
  return platform === "android" && shellFor(width) === "phone";
}
