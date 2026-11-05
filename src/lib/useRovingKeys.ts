import { useEffect, type RefObject } from "react";
import { rovingTarget, type RovingOrientation } from "./roving";

export function useRovingKeys(
  container: RefObject<HTMLElement | null>,
  selector: string,
  orientation: RovingOrientation,
) {
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const items = Array.from(root!.querySelectorAll<HTMLElement>(selector)).filter(
        (item) => !(item as HTMLButtonElement).disabled,
      );
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = rovingTarget(current, items.length, event.key, orientation);
      if (next === null) return;
      event.preventDefault();
      event.stopPropagation();
      items[next].focus();
    }
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [container, selector, orientation]);
}
