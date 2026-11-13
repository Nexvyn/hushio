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
  "flex h-full w-11 items-center justify-center text-ink-2 motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out hover:bg-ink-1/[0.06] hover:text-ink-1";

const closeButton =
  "flex h-full w-11 items-center justify-center text-ink-2 motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out hover:bg-[rgb(var(--danger))] hover:text-on-danger";

const compactBase =
  "grid h-10 w-10 place-items-center rounded-[12px] [corner-shape:squircle] text-ink-2 motion-safe:transition-colors motion-safe:duration-quick motion-safe:ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

const compactButton = `${compactBase} hover:bg-ink-1/[0.06] hover:text-ink-1`;

const compactCloseButton = `${compactBase} hover:bg-[rgb(var(--danger))] hover:text-on-danger`;

type CaptionButtonsProps = {
  variant?: "default" | "compact";
};

export function CaptionButtons({ variant = "default" }: CaptionButtonsProps) {
  const [maximized, setMaximized] = useState(false);
  const compact = variant === "compact";

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

  const maximizeLabel = maximized ? "Restore" : "Maximise";

  return (
    <div className={compact ? "flex h-full shrink-0 items-center gap-0" : "-mr-3 flex h-full shrink-0 items-stretch"}>
      <button
        type="button"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => void minimizeWindow()}
        className={compact ? compactButton : captionButton}
      >
        <Icon icon={MinusSignIcon} />
      </button>
      <button
        type="button"
        aria-label={maximizeLabel}
        title={maximizeLabel}
        onClick={() => void toggleMaximizeWindow()}
        className={compact ? compactButton : captionButton}
      >
        <Icon icon={maximized ? SquareStackIcon : SquareIcon} />
      </button>
      <button
        type="button"
        aria-label="Close"
        title="Close"
        onClick={() => void closeWindow()}
        className={compact ? compactCloseButton : closeButton}
      >
        <Icon icon={Cancel01Icon} />
      </button>
    </div>
  );
}
