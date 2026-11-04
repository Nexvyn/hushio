import {
  listenPipCommand,
  listenPipNeedState,
  listenPipOpenChanged,
  pipIsOpen,
  pipSendState,
} from "../lib/bridge";
import { useLibrary } from "../stores/library";
import { currentTrack, usePlayer, type PlayerState } from "../stores/player";
import type { PipCommand, PipSnapshot } from "./types";

const SIMPLE_COMMANDS = ["toggle", "next", "prev", "mute", "shuffle", "repeat", "like"] as const;

export function buildSnapshot(player: PlayerState, liked: readonly { id: string }[]): PipSnapshot {
  const track = currentTrack(player);
  const likedIds = new Set(liked.map((item) => item.id));
  return {
    track: track ? { id: track.id, title: track.title, artist: track.artist, thumb: track.thumb ?? "" } : null,
    playing: player.playing,
    buffering: player.buffering,
    position: player.position,
    duration: player.duration,
    volume: player.volume,
    muted: player.muted,
    shuffle: player.shuffle,
    repeat: player.repeat,
    liked: track ? likedIds.has(track.id) : false,
  };
}

export function parsePipCommand(value: unknown): PipCommand | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const simple = SIMPLE_COMMANDS.find((name) => name === raw.type);
  if (simple) return { type: simple };
  if (raw.type === "seek" && typeof raw.sec === "number" && Number.isFinite(raw.sec)) {
    return { type: "seek", sec: raw.sec };
  }
  if (raw.type === "volume" && typeof raw.v === "number" && Number.isFinite(raw.v)) {
    return { type: "volume", v: Math.min(1, Math.max(0, raw.v)) };
  }
  return null;
}

export function executePipCommand(command: PipCommand): void {
  const player = usePlayer.getState();
  switch (command.type) {
    case "toggle":
      player.toggle();
      return;
    case "next":
      player.next(true);
      return;
    case "prev":
      player.prev();
      return;
    case "seek":
      player.seek(command.sec);
      return;
    case "volume":
      player.setVolume(command.v);
      return;
    case "mute":
      player.toggleMute();
      return;
    case "shuffle":
      player.toggleShuffle();
      return;
    case "repeat":
      player.cycleRepeat();
      return;
    case "like": {
      const track = currentTrack(player);
      if (track) useLibrary.getState().toggleLike(track);
      return;
    }
  }
}

export type PipSync = {
  push: (force?: boolean) => void;
  setOpen: (open: boolean) => void;
};

export function createPipSync(
  snapshot: () => PipSnapshot,
  send: (snapshot: PipSnapshot) => Promise<void>,
): PipSync {
  let open = false;
  let last: string | null = null;
  const push = (force = false) => {
    if (!open && !force) return;
    const next = snapshot();
    const key = JSON.stringify(next);
    if (!force && key === last) return;
    last = key;
    void send(next).catch(() => {});
  };
  return {
    push,
    setOpen(value) {
      open = value;
      if (value) push(true);
    },
  };
}

export function startPipSync(): () => void {
  const sync = createPipSync(
    () => buildSnapshot(usePlayer.getState(), useLibrary.getState().liked),
    pipSendState,
  );
  const stores = [usePlayer.subscribe(() => sync.push()), useLibrary.subscribe(() => sync.push())];
  const listeners = Promise.all([
    listenPipOpenChanged((open) => sync.setOpen(open)),
    listenPipNeedState(() => sync.setOpen(true)),
    listenPipCommand((payload) => {
      const command = parsePipCommand(payload);
      if (command) executePipCommand(command);
    }),
  ]).catch(() => []);
  void pipIsOpen()
    .then((open) => {
      if (open) sync.setOpen(true);
    })
    .catch(() => {});
  return () => {
    for (const unsubscribe of stores) unsubscribe();
    void listeners.then((unlisten) => {
      for (const fn of unlisten) fn();
    });
  };
}
