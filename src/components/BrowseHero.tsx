import type { MenuItem } from "../stores/ui";
import { Shuffle } from "@phosphor-icons/react";
import { ActionMenu } from "./ActionMenu";
import { Icon } from "./Icon";
import { PlayRound } from "./PlayRound";

export const ROUND =
  "flex h-10 w-10 items-center justify-center rounded-[12px] [corner-shape:squircle] border border-separator bg-surface text-ink-1 hover:bg-hover disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
export const PILL =
  "inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-body font-medium text-on-accent hover:opacity-90 disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
export const SHUFFLE_PILL =
  "inline-flex h-10 items-center gap-2 rounded-full bg-wash px-5 text-body font-medium text-ink-1 hover:bg-hover disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
export const GHOST_ICON =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-1 hover:bg-hover disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

type HeroControlsProps = {
  onShuffle: () => void;
  onPlay: () => void;
  shuffleDisabled: boolean;
  playDisabled: boolean;
  menu: MenuItem[];
};

export function HeroControls({ onShuffle, onPlay, shuffleDisabled, playDisabled, menu }: HeroControlsProps) {
  return (
    <>
      <PlayRound disabled={playDisabled} onClick={onPlay} />
      <button
        type="button"
        aria-label="Shuffle"
        title="Shuffle"
        disabled={shuffleDisabled}
        onClick={onShuffle}
        className={SHUFFLE_PILL}
      >
        <Icon icon={Shuffle} />
        Shuffle
      </button>
      <ActionMenu items={menu} label="More options" triggerClass={GHOST_ICON} />
    </>
  );
}
