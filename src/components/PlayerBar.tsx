import { useEffect, useId, useState } from "react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Loading03Icon,
  Mic01Icon,
  MoonIcon,
  MusicNote01Icon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlayListAddIcon,
  PreviousIcon,
  Queue01Icon,
  RepeatIcon,
  RepeatOne01Icon,
  ShuffleIcon,
  VolumeHighIcon,
  VolumeOffIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { LikeButton } from "./LikeButton";
import { PipButton } from "../pip/PipButton";
import { upgradeArtwork } from "../lib/artwork";
import { sleepMenuItems, sleepStatus } from "../lib/sleepActions";
import { formatSleepLeft } from "../lib/sleepTimer";
import { fmtTime } from "../lib/format";
import { playerAddMenuItems, songOf } from "../lib/trackActions";
import { currentTrack, usePlayer, type RepeatMode } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useSleepTimer } from "../stores/sleepTimer";
import { type MenuItem, useUI } from "../stores/ui";
import type { Track } from "../types";

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: "Enable repeat",
  all: "Disable repeat",
  one: "Disable repeat one",
};

type TransportButtonProps = {
  label: string;
  icon: IconSvgElement;
  active?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function TransportButton({ label, icon, active = false, pressed, disabled = false, onClick }: TransportButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`relative hit-area grid h-8 w-8 shrink-0 place-items-center rounded-full motion-safe:transition-colors motion-safe:duration-quick disabled:opacity-[var(--disabled-opacity)] ${active ? "text-ink-1" : "text-ink-2 hover:text-ink-1"}`}
    >
      <Icon icon={icon} />
      {active && (
        <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink-1" />
      )}
    </button>
  );
}

function SleepTimer() {
  const owner = useId();
  const endsAt = useSleepTimer((state) => state.endsAt);
  const endOfSong = useSleepTimer((state) => state.endOfSong);
  const open = useUI((state) => state.contextMenu?.owner === owner);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const status = sleepStatus({ endsAt, endOfSong }, now);
  const left = endsAt === null ? null : formatSleepLeft(endsAt - now);
  const label = status ? `Sleep timer: ${status.toLowerCase()}` : "Sleep timer";

  return (
    <span className="flex items-center">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onPointerDown={(event) => {
          if (open) event.stopPropagation();
        }}
        onClick={(event) => {
          const ui = useUI.getState();
          if (ui.contextMenu?.owner === owner) {
            ui.closeContextMenu();
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const header: MenuItem = { label: status ?? "Sleep timer", header: true };
          ui.openContextMenu(rect.left, rect.top, [header, ...sleepMenuItems()], { owner, above: true });
        }}
        className={`relative hit-area grid h-8 w-8 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-safe:transition-colors motion-safe:duration-quick ${status ? "text-ink-1" : "text-ink-2 hover:text-ink-1"}`}
      >
        <Icon icon={MoonIcon} />
        {status && (
          <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink-1" />
        )}
      </button>
      {left && <span className="-ml-0.5 mr-1 text-[11px] tabular-nums text-ink-2">{left}</span>}
    </span>
  );
}

function AddToPlaylist({ track }: { track: Track | null }) {
  const owner = useId();
  const open = useUI((state) => state.contextMenu?.owner === owner);
  return (
    <button
      type="button"
      aria-label="Add to playlist"
      title="Add to playlist"
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={track === null}
      onPointerDown={(event) => {
        if (open) event.stopPropagation();
      }}
      onClick={(event) => {
        const ui = useUI.getState();
        if (ui.contextMenu?.owner === owner) {
          ui.closeContextMenu();
          return;
        }
        if (!track) return;
        const rect = event.currentTarget.getBoundingClientRect();
        ui.openContextMenu(rect.left, rect.top, playerAddMenuItems(songOf(track)), { owner, above: true });
      }}
      className="hit-area grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors"
    >
      <Icon icon={PlayListAddIcon} />
    </button>
  );
}

function NowPlaying({ track }: { track: Track | null }) {
  const toggleNowPlaying = useUI((state) => state.toggleNowPlaying);
  const art = upgradeArtwork(track?.thumb);
  return (
    <div className="flex min-w-0 items-center pl-2">
      <button
        type="button"
        title="Now playing view"
        aria-label="Now playing view"
        onClick={toggleNowPlaying}
        className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[4px] bg-wash text-ink-2"
      >
        {art ? <img src={art} alt="" className="h-full w-full object-cover" /> : <Icon icon={MusicNote01Icon} />}
      </button>
      <div className="ml-2.5 min-w-0">
        <p className="truncate text-[14px] leading-[19px] text-ink-1">{track?.title ?? "Nothing playing"}</p>
        <p className="truncate text-[12px] leading-[17px] text-ink-2">
          {track?.artist ?? "Search for something to play"}
        </p>
      </div>
      <LikeButton track={track} className="hit-area ml-1 h-8 w-8" />
      <AddToPlaylist track={track} />
    </div>
  );
}

function PlayDisc() {
  const playing = usePlayer((state) => state.playing);
  const buffering = usePlayer((state) => state.buffering);
  const toggle = usePlayer((state) => state.toggle);
  const label = playing ? "Pause" : "Play";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={toggle}
      className="hit-area grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-on-primary motion-safe:transition-transform motion-safe:duration-quick motion-safe:active:scale-[0.97]"
    >
      {buffering ? (
        <span className="grid place-items-center bt-spin">
          <Icon icon={Loading03Icon} />
        </span>
      ) : (
        <Icon icon={playing ? PauseIcon : PlayIcon} />
      )}
    </button>
  );
}

function SeekBar() {
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const seek = usePlayer((state) => state.seek);
  const max = duration > 0 ? duration : 1;
  return (
    <div className="flex w-full items-center gap-2 text-[11px] tabular-nums text-ink-2">
      <span className="w-10 text-right">{fmtTime(position)}</span>
      <input
        type="range"
        aria-label="Seek"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(position, max)}
        disabled={duration === 0}
        onChange={(event) => seek(Number(event.target.value))}
        className="min-w-0 flex-1 cursor-pointer accent-ink-1 disabled:cursor-default disabled:opacity-[var(--disabled-opacity)]"
      />
      <span className="w-10">{fmtTime(duration)}</span>
    </div>
  );
}

function VolumeControl() {
  const volume = usePlayer((state) => state.volume);
  const muted = usePlayer((state) => state.muted);
  const setVolume = usePlayer((state) => state.setVolume);
  const toggleMute = usePlayer((state) => state.toggleMute);
  const silent = muted || volume === 0;
  return (
    <div className="flex items-center gap-1">
      <TransportButton
        label={muted ? "Unmute" : "Mute"}
        icon={silent ? VolumeOffIcon : VolumeHighIcon}
        onClick={toggleMute}
      />
      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        className="w-24 cursor-pointer accent-ink-1"
      />
    </div>
  );
}

export function PlayerBar() {
  const track = usePlayer(currentTrack);
  const queueLength = usePlayer((state) => state.queue.length);
  const shuffle = usePlayer((state) => state.shuffle);
  const repeat = usePlayer((state) => state.repeat);
  const toggleShuffle = usePlayer((state) => state.toggleShuffle);
  const cycleRepeat = usePlayer((state) => state.cycleRepeat);
  const prev = usePlayer((state) => state.prev);
  const next = usePlayer((state) => state.next);
  const rightPanel = useUI((state) => state.rightPanel);
  const toggleQueue = useUI((state) => state.toggleQueue);
  const lyricsCenter = useUI((state) => state.lyricsCenter);
  const toggleLyrics = useUI((state) => state.toggleLyrics);
  const hideVolumeBar = useSettings((state) => state.hideVolumeBar);
  const empty = queueLength === 0;

  return (
    <footer aria-label="Player" className="h-[88px] shrink-0 border-t border-separator bg-base px-2">
      <div className="grid h-full grid-cols-[3fr_4fr_3fr] items-center">
        <NowPlaying track={track} />

        <div className="flex flex-col justify-center gap-2">
          <div className="flex w-full items-center gap-4">
            <div className="flex flex-1 items-center justify-end gap-2">
              <TransportButton
                label={shuffle ? "Disable Shuffle" : "Enable Shuffle"}
                icon={ShuffleIcon}
                active={shuffle}
                onClick={toggleShuffle}
              />
              <TransportButton label="Previous" icon={PreviousIcon} disabled={empty} onClick={prev} />
            </div>
            <PlayDisc />
            <div className="flex flex-1 items-center gap-2">
              <TransportButton label="Next" icon={NextIcon} disabled={empty} onClick={() => next(true)} />
              <TransportButton
                label={REPEAT_LABEL[repeat]}
                icon={repeat === "one" ? RepeatOne01Icon : RepeatIcon}
                active={repeat !== "off"}
                onClick={cycleRepeat}
              />
            </div>
          </div>
          <SeekBar />
        </div>

        <div className="flex items-center justify-end gap-2">
          <SleepTimer />
          <PipButton />
          <TransportButton
            label="Lyrics"
            icon={Mic01Icon}
            active={lyricsCenter}
            pressed={lyricsCenter}
            onClick={toggleLyrics}
          />
          <TransportButton
            label="Queue"
            icon={Queue01Icon}
            active={rightPanel === "queue"}
            pressed={rightPanel === "queue"}
            onClick={toggleQueue}
          />
          {!hideVolumeBar && <VolumeControl />}
        </div>
      </div>
    </footer>
  );
}
