import type { IconSvgElement } from "@hugeicons/react";
import {
  Loading03Icon,
  MusicNote01Icon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlayListAddIcon,
  PlayListIcon,
  PreviousIcon,
  Queue01Icon,
  RepeatIcon,
  RepeatOne01Icon,
  ShuffleIcon,
  VolumeHighIcon,
  VolumeOffIcon,
} from "@hugeicons/core-free-icons";
import { ActionMenu, type MenuItem } from "./ActionMenu";
import { Icon } from "./Icon";
import { LikeButton } from "./LikeButton";
import { upgradeArtwork } from "../lib/artwork";
import { addTrackToPlaylist, openCreatePlaylist } from "../lib/collectionActions";
import { fmtTime } from "../lib/format";
import { useLibrary } from "../stores/library";
import { currentTrack, usePlayer, type RepeatMode } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
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
      className={`relative grid h-8 w-8 shrink-0 place-items-center rounded-full motion-safe:transition-colors motion-safe:duration-150 disabled:opacity-[var(--disabled-opacity)] ${active ? "text-ink-1" : "text-ink-2 hover:text-ink-1"}`}
    >
      <Icon icon={icon} />
      {active && (
        <span aria-hidden="true" className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink-1" />
      )}
    </button>
  );
}

function AddToPlaylist({ track }: { track: Track | null }) {
  const playlists = useLibrary((state) => state.playlists);
  const items: MenuItem[] = [
    ...playlists.map((playlist) => ({
      label: playlist.name,
      icon: PlayListIcon,
      onSelect: () => {
        if (track) addTrackToPlaylist(playlist.id, track);
      },
    })),
    {
      label: "Create playlist",
      icon: PlayListAddIcon,
      separatorBefore: playlists.length > 0,
      onSelect: openCreatePlaylist,
    },
  ];
  return (
    <ActionMenu
      items={items}
      label="Add to playlist"
      icon={PlayListAddIcon}
      disabled={track === null}
      placement="up"
      triggerClass="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 hover:text-ink-1 disabled:opacity-[var(--disabled-opacity)] motion-safe:transition-colors"
    />
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
      <LikeButton track={track} className="ml-1 h-8 w-8" />
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
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-on-primary motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:scale-[1.06] motion-safe:active:scale-95"
    >
      {buffering ? (
        <span className="grid place-items-center motion-safe:animate-spin">
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
