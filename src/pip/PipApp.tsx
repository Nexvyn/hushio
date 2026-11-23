import { useEffect, useRef, useState } from "react";
import { AppWindow, X, ArrowsOut, Heart, Minus, MusicNote, SkipForward, Pause, Play, SkipBack, Repeat, RepeatOnce, ArrowsIn, Shuffle, SpeakerHigh, SpeakerX, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { Groove } from "../components/Groove";
import { Icon } from "../components/Icon";
import {
  listenPipState,
  listenSessionErased,
  pipClose,
  pipMinimize,
  pipReady,
  pipSendCommand,
  pipSetCompact,
  pipShowMain,
} from "../lib/bridge";
import type { PipCommand, PipSnapshot } from "./types";

const SEEK_STEP = 5;
const VOLUME_STEP = 0.05;
const COMPACT_BELOW_HEIGHT = 175;

type ButtonProps = {
  label: string;
  icon: PhosphorIcon;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
};

function IconButton({ label, icon, onClick, pressed, disabled = false }: ButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#b3b3b3] hover:text-white disabled:opacity-40 ${pressed ? "text-white" : ""}`}
    >
      <Icon icon={icon} fill={pressed ? "fill" : "none"} />
    </button>
  );
}

export function PipApp() {
  const [snapshot, setSnapshot] = useState<PipSnapshot | null>(null);
  const [compact, setCompact] = useState(() => window.innerHeight < COMPACT_BELOW_HEIGHT);
  const latest = useRef<PipSnapshot | null>(null);
  useEffect(() => {
    latest.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    let detach: Array<() => void> = [];
    let active = true;
    const registered = Promise.all([
      listenPipState((next) => setSnapshot(next)),
      listenSessionErased(() => void pipClose()),
    ]);
    registered
      .then((unlisten) => {
        if (!active) {
          for (const fn of unlisten) fn();
          return;
        }
        detach = unlisten;
        return pipReady();
      })
      .catch(() => {});
    return () => {
      active = false;
      for (const fn of detach) fn();
    };
  }, []);

  useEffect(() => {
    const send = (command: PipCommand) => {
      void pipSendCommand(command).catch(() => {});
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const arrow = event.code.startsWith("Arrow");
      if (event.repeat && (!arrow || event.shiftKey)) return;
      if (arrow && event.target instanceof HTMLInputElement) return;
      const shot = latest.current;
      switch (event.code) {
        case "Space":
          event.preventDefault();
          send({ type: "toggle" });
          return;
        case "ArrowRight":
          if (event.shiftKey) send({ type: "next" });
          else if (shot) send({ type: "seek", sec: Math.min(shot.duration, shot.position + SEEK_STEP) });
          return;
        case "ArrowLeft":
          if (event.shiftKey) send({ type: "prev" });
          else if (shot) send({ type: "seek", sec: Math.max(0, shot.position - SEEK_STEP) });
          return;
        case "ArrowUp":
          event.preventDefault();
          if (shot) send({ type: "volume", v: Math.min(1, shot.volume + VOLUME_STEP) });
          return;
        case "ArrowDown":
          event.preventDefault();
          if (shot) send({ type: "volume", v: Math.max(0, shot.volume - VOLUME_STEP) });
          return;
        case "KeyM":
          send({ type: "mute" });
          return;
        case "KeyS":
          send({ type: "shuffle" });
          return;
        case "KeyR":
          send({ type: "repeat" });
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const track = snapshot?.track ?? null;
  const ready = snapshot !== null;
  const send = (command: PipCommand) => {
    void pipSendCommand(command).catch(() => {});
  };
  const toggleCompact = () => {
    const next = !compact;
    setCompact(next);
    void pipSetCompact(next).catch(() => {});
  };

  return (
    <div
      className="fixed inset-0 flex select-none flex-col overflow-hidden bg-black text-white"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div data-tauri-drag-region className="flex h-[26px] shrink-0 items-center justify-end gap-1 px-1">
        <IconButton
          label={compact ? "Expand mini player" : "Compact mini player"}
          icon={compact ? ArrowsOut : ArrowsIn}
          onClick={toggleCompact}
        />
        <IconButton label="Minimize" icon={Minus} onClick={() => void pipMinimize()} />
        <IconButton label="Show Hushio" icon={AppWindow} onClick={() => void pipShowMain()} />
        <IconButton label="Close mini player" icon={X} onClick={() => void pipClose()} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-1 pb-1">
        {!compact && (
          <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-[8px] bg-[#181818]">
            {track?.thumb ? (
              <img loading="lazy" decoding="async" src={track.thumb} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
              <Icon icon={MusicNote} />
            )}
          </div>
        )}

        <div className="flex min-w-0 items-center gap-2 px-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold">
              {track ? track.title : ready ? "Nothing playing" : ""}
            </p>
            <p className="truncate text-meta text-[#b3b3b3]">{track?.artist ?? ""}</p>
          </div>
          <IconButton
            label={snapshot?.liked ? "Remove from Liked" : "Add to Liked"}
            icon={Heart}
            pressed={snapshot?.liked ?? false}
            disabled={!track}
            onClick={() => send({ type: "like" })}
          />
        </div>

        <div className="px-1">
          <Groove
            variant="plain"
            compact
            seed={track?.id ?? ""}
            position={snapshot?.position ?? 0}
            duration={snapshot?.duration ?? 0}
            playing={snapshot?.playing ?? false}
            onSeek={(sec) => send({ type: "seek", sec })}
          />
        </div>

        <div className="flex items-center justify-center gap-1">
          <IconButton
            label="Shuffle"
            icon={Shuffle}
            pressed={snapshot?.shuffle ?? false}
            onClick={() => send({ type: "shuffle" })}
          />
          <IconButton label="Previous" icon={SkipBack} disabled={!track} onClick={() => send({ type: "prev" })} />
          <PlayButton playing={snapshot?.playing ?? false} disabled={!track} onClick={() => send({ type: "toggle" })} />
          <IconButton label="Next" icon={SkipForward} disabled={!track} onClick={() => send({ type: "next" })} />
          <IconButton
            label={snapshot?.repeat === "one" ? "Repeat one" : "Repeat"}
            icon={snapshot?.repeat === "one" ? RepeatOnce : Repeat}
            pressed={snapshot !== null && snapshot.repeat !== "off"}
            onClick={() => send({ type: "repeat" })}
          />
          <IconButton
            label={snapshot?.muted ? "Unmute" : "Mute"}
            icon={snapshot?.muted ? SpeakerX : SpeakerHigh}
            pressed={snapshot?.muted ?? false}
            onClick={() => send({ type: "mute" })}
          />
        </div>
      </div>
    </div>
  );
}

function PlayButton({ playing, disabled, onClick }: { playing: boolean; disabled: boolean; onClick: () => void }) {
  const label = playing ? "Pause" : "Play";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-black disabled:opacity-40"
    >
      <Icon icon={playing ? Pause : Play} />
    </button>
  );
}
