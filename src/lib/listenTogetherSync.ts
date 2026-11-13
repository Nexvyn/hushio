import { useEffect } from "react";
import { needsResync } from "./listenTogether/protocol";
import { useListenTogether } from "../stores/listenTogether";
import { usePlayer } from "../stores/player";

const HEARTBEAT_MS = 5_000;

export function useListenTogetherSync(): void {
  const room = useListenTogether((state) => state.room);
  const publishState = useListenTogether((state) => state.publishState);
  const requestState = useListenTogether((state) => state.requestState);

  useEffect(() => {
    if (room.status !== "joined") return;
    if (room.role === "host") {
      publishState(currentRoomState());
      const timer = window.setInterval(() => publishState(currentRoomState()), HEARTBEAT_MS);
      return () => window.clearInterval(timer);
    }
    requestState();
    return undefined;
  }, [room.status, room.role, publishState, requestState]);

  useEffect(() => {
    if (room.status !== "joined" || room.role !== "guest" || !room.state) return;
    const player = usePlayer.getState();
    const track = player.queue[player.index];
    if (!track || track.id !== room.state.trackId) return;
    const local = player.position * 1000;
    const remote = room.state.position * 1000 + room.driftMs;
    if (needsResync(local, remote)) {
      usePlayer.getState().seek(remote / 1000);
    }
  }, [room.state, room.role, room.status, room.driftMs]);
}

function currentRoomState() {
  const player = usePlayer.getState();
  const track = player.queue[player.index];
  return {
    trackId: track?.id ?? null,
    title: track?.title ?? "",
    artist: track?.artist ?? "",
    thumb: track?.thumb ?? null,
    position: player.position,
    playing: player.playing,
    updatedAt: Date.now(),
  };
}
