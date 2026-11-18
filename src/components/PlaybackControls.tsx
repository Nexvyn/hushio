import { motion } from "motion/react";
import { CircleNotch, SkipForward, Pause, Play, SkipBack, Repeat, Shuffle, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Icon } from "./Icon";
import { ActiveDot, ToggleIcon } from "./motion/ToggleIcon";
import { SwapGlyph } from "./motion/SwapGlyph";
import { type RepeatMode, usePlayer } from "../stores/player";
import { type ShuffleMode, shuffleModeOf } from "../lib/smartShuffle";
import { phoneBouncy, reducedMotion } from "../lib/motion";
import type { ToggleKind } from "../lib/toggleMotion";

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: "Enable repeat",
  all: "Disable repeat",
  one: "Disable repeat one",
};

const SHUFFLE_LABEL: Record<ShuffleMode, string> = {
  off: "Shuffle off",
  shuffle: "Shuffle on",
  smart: "Smart shuffle on",
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
const PRESS = "motion-safe:transition-transform motion-safe:duration-press motion-safe:active:scale-[0.97]";

type TransportButtonProps = {
  label: string;
  hint?: string;
  icon: PhosphorIcon;
  active?: boolean;
  dot?: boolean;
  smart?: boolean;
  filled?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onArt?: boolean;
  motionKind?: ToggleKind;
  motionState?: string;
  badge?: string;
  flyTarget?: string;
  onClick: () => void;
};

export function TransportButton({ label, hint, icon, active = false, dot = true, smart = false, filled = false, pressed, disabled = false, onArt = false, motionKind, motionState, badge, flyTarget, onClick }: TransportButtonProps) {
  const tone = onArt
    ? active
      ? "text-accent"
      : "text-art/[0.72] hover:text-art"
    : active
      ? "text-ink-1"
      : "text-ink-2 hover:text-ink-1";
  const glyph = <Icon icon={icon} />;
  return (
    <button
      type="button"
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      aria-pressed={pressed}
      data-fly-target={flyTarget}
      disabled={disabled}
      onClick={onClick}
      className={`relative hit-area grid ${onArt ? "h-10 w-10" : "h-9 w-9"} shrink-0 place-items-center rounded-full disabled:opacity-[var(--disabled-opacity)] ${FOCUS} ${PRESS} ${filled ? "[&_path]:fill-current" : ""} ${tone}`}
    >
      {motionKind ? (
        <ToggleIcon kind={motionKind} state={motionState ?? (active ? "on" : "off")} badge={badge}>
          {glyph}
        </ToggleIcon>
      ) : (
        glyph
      )}
      {active && dot && <ActiveDot className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />}
      {smart && <span aria-hidden="true" className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />}
    </button>
  );
}

function PlayButton({ playing, buffering, onArt = false, onClick }: { playing: boolean; buffering: boolean; onArt?: boolean; onClick: () => void }) {
  const label = playing ? "Pause" : "Play";
  const reduced = reducedMotion();
  return (
    <motion.button
      type="button"
      title={`${label} (Space)`}
      aria-label={label}
      onClick={onClick}
      whileTap={reduced ? undefined : { scale: 0.92 }}
      transition={phoneBouncy}
      className={`grid ${onArt ? "h-16 w-16" : "h-9 w-9"} shrink-0 place-items-center rounded-full ${onArt ? "bg-art text-base" : "bg-primary text-on-primary"} ${FOCUS}`}
    >
      {buffering ? (
        <span className="grid place-items-center bt-spin">
          <Icon icon={CircleNotch} />
        </span>
      ) : (
        <SwapGlyph swapKey={playing ? "pause" : "play"}>
          {playing ? <Icon icon={Pause} /> : <span className="grid translate-x-px place-items-center"><Icon icon={Play} /></span>}
        </SwapGlyph>
      )}
    </motion.button>
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
  const shuffleMode = usePlayer(shuffleModeOf);
  const repeat = usePlayer((state) => state.repeat);
  const cycleShuffle = usePlayer((state) => state.cycleShuffle);
  const cycleRepeat = usePlayer((state) => state.cycleRepeat);
  const prev = usePlayer((state) => state.prev);
  const next = usePlayer((state) => state.next);
  const empty = usePlayer((state) => state.queue.length === 0);

  return (
    <>
      <TransportButton
        label={SHUFFLE_LABEL[shuffleMode]}
        hint="S"
        icon={Shuffle}
        active={shuffleMode !== "off"}
        dot={shuffleMode === "shuffle"}
        smart={shuffleMode === "smart"}
        pressed={shuffleMode !== "off"}
        motionKind="shuffle"
        onArt={onArt}
        onClick={cycleShuffle}
      />
      <TransportButton label="Previous" hint="Shift+Left" icon={SkipBack} disabled={empty} onArt={onArt} onClick={prev} />
      <PlayButton playing={playing} buffering={buffering} onArt={onArt} onClick={toggle} />
      <TransportButton label="Next" hint="Shift+Right" icon={SkipForward} disabled={empty} onArt={onArt} onClick={() => next(true)} />
      <TransportButton
        label={REPEAT_LABEL[repeat]}
        hint="R"
        icon={Repeat}
        active={repeat !== "off"}
        pressed={repeat !== "off"}
        motionKind="repeat"
        motionState={repeat}
        badge={repeat === "one" ? "1" : undefined}
        onArt={onArt}
        onClick={cycleRepeat}
      />
    </>
  );
}
