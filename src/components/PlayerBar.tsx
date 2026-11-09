import { useEffect, useId, useMemo, useState } from "react";
import { normalizeCredit } from "../lib/credits";
import {
  FullScreenIcon,
  Mic01Icon,
  MoonIcon,
  ListPlusIcon,
  MusicNote01Icon,
  Queue01Icon,
  VolumeHighIcon,
  VolumeOffIcon,
} from "@hugeicons/core-free-icons";
import { Icon } from "./Icon";
import { Groove } from "./Groove";
import { LikeButton } from "./LikeButton";
import { PlaybackControls, TransportButton } from "./PlaybackControls";
import { PipButton } from "../pip/PipButton";
import { setFullScreen } from "../lib/bridge";
import { upgradeArtwork } from "../lib/artwork";
import { sleepMenuItems, sleepStatus } from "../lib/sleepActions";
import { formatSleepLeft } from "../lib/sleepTimer";
import { visibleLyricLines } from "../lib/lyricsLines";
import { playerAddMenuItems, songOf } from "../lib/trackActions";
import { useTrackLyrics } from "../lib/useTrackLyrics";
import { currentTrack, usePlayer } from "../stores/player";
import { useSettings } from "../stores/settings";
import { useSleepTimer } from "../stores/sleepTimer";
import { type MenuItem, useUI } from "../stores/ui";
import type { Track } from "../types";

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
        className={`relative hit-area grid h-9 w-9 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${status ? "text-ink-1" : "text-ink-2 hover:text-ink-1"}`}
      >
        <Icon icon={MoonIcon} />
        {status && <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />}
      </button>
      {left && <span className="-ml-0.5 mr-1 text-[11px] tabular-nums text-ink-2">{left}</span>}
    </span>
  );
}

export function AddToPlaylist({ track, onArt = false }: { track: Track | null; onArt?: boolean }) {
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
      className={`hit-area grid ${onArt ? "h-10 w-10 text-art/[0.72] hover:text-art" : "h-9 w-9 text-ink-2 hover:text-ink-1"} shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-[var(--disabled-opacity)]`}
    >
      <Icon icon={ListPlusIcon} />
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
          {track ? normalizeCredit(track.artist) : "Search for something to play"}
        </p>
      </div>
      <LikeButton track={track} className="hit-area ml-1 h-8 w-8" />
      <AddToPlaylist track={track} />
    </div>
  );
}

function PlayerGroove({ track }: { track: Track | null }) {
  const position = usePlayer((state) => state.position);
  const duration = usePlayer((state) => state.duration);
  const playing = usePlayer((state) => state.playing);
  const seek = usePlayer((state) => state.seek);
  const { lyrics } = useTrackLyrics(track, duration);
  const synced = lyrics?.synced ?? null;
  const lines = useMemo(() => (synced ? visibleLyricLines(synced) : []), [synced]);
  return (
    <Groove
      profile="bar"
      seed={track?.id ?? ""}
      position={position}
      duration={duration}
      onSeek={seek}
      lyrics={lines}
      playing={playing}
    />
  );
}

function VolumeControl() {
  const volume = usePlayer((state) => state.volume);
  const muted = usePlayer((state) => state.muted);
  const setVolume = usePlayer((state) => state.setVolume);
  const toggleMute = usePlayer((state) => state.toggleMute);
  const level = muted ? 0 : volume;
  const silent = muted || volume === 0;
  return (
    <div className="flex items-center gap-1">
      <TransportButton
        label={muted ? "Unmute" : "Mute"}
        hint="M"
        icon={silent ? VolumeOffIcon : VolumeHighIcon}
        onClick={toggleMute}
      />
      <input
        type="range"
        aria-label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={level}
        onChange={(event) => setVolume(Number(event.target.value))}
        className="w-24 cursor-pointer rounded-full accent-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
    </div>
  );
}

function FullScreenButton() {
  const osFullscreen = useUI((state) => state.osFullscreen);
  return (
    <TransportButton
      label="Full screen"
      icon={FullScreenIcon}
      pressed={osFullscreen}
      onClick={() => void setFullScreen(!osFullscreen)}
    />
  );
}

export function PlayerBar({ trackInfo = true, transport = true, surface = "bar" }: { trackInfo?: boolean; transport?: boolean; surface?: "bar" | "none" }) {
  const surfaceClass = surface === "bar" ? "bg-base" : "";
  const track = usePlayer(currentTrack);
  const rightPanel = useUI((state) => state.rightPanel);
  const toggleQueue = useUI((state) => state.toggleQueue);
  const lyricsCenter = useUI((state) => state.lyricsCenter);
  const toggleLyrics = useUI((state) => state.toggleLyrics);
  const hideVolumeBar = useSettings((state) => state.hideVolumeBar);

  const utilities = (
    <div className="flex items-center justify-end gap-1">
      <SleepTimer />
      <TransportButton
        label="Lyrics"
        hint="L"
        icon={Mic01Icon}
        active={lyricsCenter}
        pressed={lyricsCenter}
        onClick={toggleLyrics}
      />
      <TransportButton
        label="Queue"
        hint="Q"
        icon={Queue01Icon}
        active={rightPanel === "queue"}
        pressed={rightPanel === "queue"}
        onClick={toggleQueue}
      />
      {!hideVolumeBar && <VolumeControl />}
      <PipButton />
      <FullScreenButton />
    </div>
  );

  if (!transport) {
    return (
      <footer aria-label="Player" className={`flex h-14 shrink-0 items-center justify-end px-3 ${surfaceClass}`}>
        {utilities}
      </footer>
    );
  }

  return (
    <footer aria-label="Player" className={`relative h-[88px] shrink-0 px-3 ${surfaceClass}`}>
      <div className="grid h-full grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,3fr)] items-center gap-4">
        {trackInfo ? <NowPlaying track={track} /> : <div aria-hidden="true" />}
        <div className="flex flex-col justify-center gap-2">
          <PlaybackControls />
          <PlayerGroove track={track} />
        </div>
        {utilities}
      </div>
    </footer>
  );
}
