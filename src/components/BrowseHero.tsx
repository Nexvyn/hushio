import type { MenuItem } from "../stores/ui";
import { PlayIcon, ShuffleIcon } from "@hugeicons/core-free-icons";
import { ActionMenu } from "./ActionMenu";
import { Icon } from "./Icon";

export const ROUND =
  "flex h-10 w-10 items-center justify-center rounded-[12px] [corner-shape:squircle] border border-separator bg-surface text-ink-1 hover:bg-hover disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
export const PILL =
  "inline-flex h-10 items-center gap-2 rounded-[12px] [corner-shape:squircle] bg-primary px-5 text-[14px] font-semibold text-on-primary hover:opacity-90 disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

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
      <button
        type="button"
        aria-label="Shuffle"
        title="Shuffle"
        disabled={shuffleDisabled}
        onClick={onShuffle}
        className={ROUND}
      >
        <Icon icon={ShuffleIcon} />
      </button>
      <button type="button" disabled={playDisabled} onClick={onPlay} className={PILL}>
        <Icon icon={PlayIcon} />
        Play
      </button>
      <ActionMenu items={menu} label="More options" triggerClass={ROUND} />
    </>
  );
}
