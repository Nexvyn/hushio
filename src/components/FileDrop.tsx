import { useEffect, useState } from "react";
import { listenFileDrop } from "../lib/bridge";
import { dropPaths } from "../lib/localDrop";

type Point = { x: number; y: number };

export const OWNED_DROP = "hushio-owned-drop";

function dropOwner(position: Point | undefined): HTMLElement | null {
  if (!position || typeof document.elementFromPoint !== "function") return null;
  const ratio = window.devicePixelRatio || 1;
  return document.elementFromPoint(position.x / ratio, position.y / ratio)?.closest<HTMLElement>("[data-owns-drop]") ?? null;
}

export function FileDrop() {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void listenFileDrop((event) => {
      if (event.type === "leave") setDragging(false);
      else if (event.type === "enter" || event.type === "over") setDragging(dropOwner(event.position) === null);
      else {
        setDragging(false);
        const owner = dropOwner(event.position);
        if (owner) owner.dispatchEvent(new CustomEvent(OWNED_DROP, { detail: { paths: event.paths } }));
        else void dropPaths(event.paths);
      }
    }).then((unlisten) => {
      if (active) stop = unlisten;
      else unlisten();
    });
    return () => {
      active = false;
      stop?.();
    };
  }, []);

  if (!dragging) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-0 z-[400] flex items-center justify-center bg-black/60"
    >
      <p className="rounded-full bg-white/10 px-6 py-3 text-body font-semibold text-ink-1">Drop to play</p>
    </div>
  );
}
