import type { IconSvgElement } from "@hugeicons/react";
import {
  Loading03Icon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  RepeatIcon,
  RepeatOne01Icon,
  ShuffleIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { type RepeatMode, usePlayer } from "../stores/player";

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: "Enable repeat",
  all: "Disable repeat",
  one: "Disable repeat one",
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const PRESS = "motion-safe:transition-transform motion-safe:duration-quick motion-safe:active:scale-[0.97]";

type TransportButtonProps = {
  label: string;
  hint?: string;
  icon: IconSvgElement;
  active?: boolean;
  dot?: boolean;
  filled?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onArt?: boolean;
  onClick: () => void;
};

export function TransportButton({ label, hint, icon, active = false, dot = true, filled = false, pressed, disabled = false, onArt = false, onClick }: TransportButtonProps) {
  const tone = onArt
    ? active
      ? "text-accent"
      : "text-art/[0.72] hover:text-art"
    : active
      ? "text-ink-1"
      : "text-ink-2 hover:text-ink-1";
  return (
    <button
      type="button"
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`relative hit-area grid ${onArt ? "h-10 w-10" : "h-9 w-9"} shrink-0 place-items-center rounded-full disabled:opacity-[var(--disabled-opacity)] ${FOCUS} ${PRESS} ${filled ? "[&_path]:fill-current" : ""} ${tone}`}
    >
      <Icon icon={icon} />
      {active && dot && <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />}
    </button>
  );
}

function PlayButton({ playing, buffering, onArt = false, onClick }: { playing: boolean; buffering: boolean; onArt?: boolean; onClick: () => void }) {
  const label = playing ? "Pause" : "Play";
  return (
    <button
      type="button"
      title={`${label} (Space)`}
      aria-label={label}
      onClick={onClick}
      className={`grid ${onArt ? "h-16 w-16" : "h-10 w-10"} shrink-0 place-items-center rounded-full ${onArt ? "bg-art text-base" : "bg-primary text-on-primary"} ${FOCUS} ${PRESS}`}
    >
      {buffering ? (
        <span className="grid place-items-center bt-spin">
          <Icon icon={Loading03Icon} />
        </span>
      ) : playing ? (
        <Icon icon={PauseIcon} />
      ) : (
        <span className="grid translate-x-px place-items-center">
          <Icon icon={PlayIcon} />
        </span>
      )}
    </button>
  );
}

export function PlaybackControls({ onArt = false }: { onArt?: boolean }) {
  return (
    <div role="group" aria-label="Playback" className="flex items-center justify-center gap-3">
      <PlaybackButtons onArt={onArt} />
    </div>
  );
}

export function PlaybackButtons({ onArt = false }: { onArt?: boolean }) {
  const playing = usePlayer((state) => state.playing);
  const buffering = usePlayer((state) => state.buffering);
  const toggle = usePlayer((state) => state.toggle);
  const shuffle = usePlayer((state) => state.shuffle);
  const repeat = usePlayer((state) => state.repeat);
  const toggleShuffle = usePlayer((state) => state.toggleShuffle);
  const cycleRepeat = usePlayer((state) => state.cycleRepeat);
  const prev = usePlayer((state) => state.prev);
  const next = usePlayer((state) => state.next);
  const empty = usePlayer((state) => state.queue.length === 0);

  return (
    <>
      <TransportButton
        label={shuffle ? "Disable Shuffle" : "Enable Shuffle"}
        hint="S"
        icon={ShuffleIcon}
        active={shuffle}
        pressed={shuffle}
        onArt={onArt}
        onClick={toggleShuffle}
      />
      <TransportButton label="Previous" hint="Shift+Left" icon={PreviousIcon} disabled={empty} onArt={onArt} onClick={prev} />
      <PlayButton playing={playing} buffering={buffering} onArt={onArt} onClick={toggle} />
      <TransportButton label="Next" hint="Shift+Right" icon={NextIcon} disabled={empty} onArt={onArt} onClick={() => next(true)} />
      <TransportButton
        label={REPEAT_LABEL[repeat]}
        hint="R"
        icon={repeat === "one" ? RepeatOne01Icon : RepeatIcon}
        active={repeat !== "off"}
        pressed={repeat !== "off"}
        onArt={onArt}
        onClick={cycleRepeat}
      />
    </>
  );
}
