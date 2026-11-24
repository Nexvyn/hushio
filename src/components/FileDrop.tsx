import { useEffect, useState } from "react";
import { listenFileDrop } from "../lib/bridge";
import { dropPaths } from "../lib/localDrop";

type Point = { x: number; y: number };

function ownsDrop(position: Point | undefined): boolean {
  if (!position || typeof document.elementFromPoint !== "function") return false;
  const ratio = window.devicePixelRatio || 1;
  return document.elementFromPoint(position.x / ratio, position.y / ratio)?.closest("[data-owns-drop]") != null;
}

export function FileDrop() {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void listenFileDrop((event) => {
      if (event.type === "leave") setDragging(false);
      else if (event.type === "enter" || event.type === "over") setDragging(!ownsDrop(event.position));
      else {
        setDragging(false);
        if (!ownsDrop(event.position)) void dropPaths(event.paths);
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
