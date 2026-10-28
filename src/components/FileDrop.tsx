import { useEffect, useState } from "react";
import { listenFileDrop } from "../lib/bridge";
import { dropPaths } from "../lib/localDrop";

export function FileDrop() {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    void listenFileDrop((event) => {
      if (event.type === "enter") setDragging(true);
      else if (event.type === "leave") setDragging(false);
      else if (event.type === "drop") {
        setDragging(false);
        void dropPaths(event.paths);
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
      <p className="rounded-full bg-white/10 px-6 py-3 text-[15px] font-semibold text-ink-1">Drop to play</p>
    </div>
  );
}
