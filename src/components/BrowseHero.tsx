import type { ReactNode } from "react";
import { PlayIcon, ShuffleIcon } from "@hugeicons/core-free-icons";
import { ActionMenu, type MenuItem } from "./ActionMenu";
import { Icon } from "./Icon";

export const ROUND =
  "flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white backdrop-blur-md hover:bg-black/60 disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";
export const PILL =
  "inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-[14.5px] font-semibold text-black hover:opacity-90 disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

type BrowseHeroProps = {
  cover: string | null;
  topPadding: string;
  children: ReactNode;
};

export function BrowseHero({ cover, topPadding, children }: BrowseHeroProps) {
  return (
    <div className="relative -mx-10 overflow-hidden">
      {cover ? (
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-wash" />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-base" />
      <div
        className={`relative flex flex-col items-center px-10 pb-2 text-center text-white drop-shadow ${topPadding}`}
      >
        {children}
      </div>
    </div>
  );
}

type HeroControlsProps = {
  onShuffle: () => void;
  onPlay: () => void;
  shuffleDisabled: boolean;
  playDisabled: boolean;
  menu: MenuItem[];
};

export function HeroControls({ onShuffle, onPlay, shuffleDisabled, playDisabled, menu }: HeroControlsProps) {
  return (
    <div className="mt-4 flex items-center gap-2.5">
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
    </div>
  );
}
