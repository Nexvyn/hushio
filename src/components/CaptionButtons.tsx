import { useEffect, useState } from "react";
import {
  Cancel01Icon,
  MinusSignIcon,
  SquareIcon,
  SquareStackIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
  watchWindowMaximized,
} from "../lib/bridge";

const captionButton =
  "flex h-14 w-11 items-center justify-center text-ink-2 motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out hover:bg-ink-1/[0.06] hover:text-ink-1";

const closeButton =
  "flex h-14 w-11 items-center justify-center text-ink-2 motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out hover:bg-[rgb(var(--danger))] hover:text-white";

export function CaptionButtons() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let live = true;
    void watchWindowMaximized(setMaximized)
      .then((unlisten) => {
        if (live) stop = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  const maximizeLabel = maximized ? "Restore" : "Maximize";

  return (
    <div className="ml-auto -mr-3 flex h-14 shrink-0 items-stretch">
      <button
        type="button"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => void minimizeWindow()}
        className={captionButton}
      >
        <Icon icon={MinusSignIcon} />
      </button>
      <button
        type="button"
        aria-label={maximizeLabel}
        title={maximizeLabel}
        onClick={() => void toggleMaximizeWindow()}
        className={captionButton}
      >
        <Icon icon={maximized ? SquareStackIcon : SquareIcon} />
      </button>
      <button
        type="button"
        aria-label="Close"
        title="Close"
        onClick={() => void closeWindow()}
        className={closeButton}
      >
        <Icon icon={Cancel01Icon} />
      </button>
    </div>
  );
}
