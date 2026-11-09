import {
  launchTake,
  listenLaunchPending,
  listenPlayerEvent,
  platform,
  playerPlay,
  playerSetQueue,
  playerTakeLaunch,
  type LaunchAction,
} from "./bridge";
import { launchTargetFor, type LaunchPayload, type LaunchTarget } from "./launchLink";
import { dropPaths } from "./localDrop";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

const SHARED_VIDEO_TITLE = "Shared YouTube video";
const OPENED_FILE_TITLE = "Opened audio file";

export function playlistBrowseId(id: string): string {
  return id.startsWith("VL") ? id : `VL${id}`;
}

async function playOpenedFile(uri: string): Promise<void> {
  await playerSetQueue(
    [
      {
        id: uri,
        title: OPENED_FILE_TITLE,
        artist: "",
        durationMs: 0,
        url: "",
        headers: {},
        liked: false,
        expiresAtEpochMs: null,
        contentUri: uri,
      },
    ],
    0,
    0,
  );
  await playerPlay();
}

export async function routeLaunchTarget(target: LaunchTarget): Promise<void> {
  if (target.kind === "playlist") {
    useNavigation.getState().navigate({ name: "ytplaylist", param: playlistBrowseId(target.id) });
    return;
  }
  if (target.kind === "video") {
    usePlayer.getState().playTrack({ id: target.id, title: SHARED_VIDEO_TITLE, artist: "", thumb: null });
    return;
  }
  if (platform === "android") {
    await playOpenedFile(target.uri);
    return;
  }
  await dropPaths([target.uri]);
}

export function routeLaunchAction(action: LaunchAction): Promise<void> {
  return routeLaunchTarget(
    action.type === "file" ? { kind: "file", uri: action.path } : { kind: "playlist", id: action.id },
  );
}

function targetOf(payload: Partial<LaunchPayload>): LaunchTarget | null {
  if (!payload.kind || payload.value === undefined) return null;
  return launchTargetFor({ kind: payload.kind, value: payload.value });
}

export function startLaunchActions(): () => void {
  let live = true;
  let stop: (() => void) | undefined;
  const android = platform === "android";

  const drain = () => {
    if (android) {
      void playerTakeLaunch()
        .then((payload) => {
          const target = targetOf(payload);
          if (target) return routeLaunchTarget(target);
        })
        .catch((error: unknown) => console.warn(`[hushio] launch intent failed: ${String(error)}`));
      return;
    }
    void launchTake()
      .then((actions) => {
        for (const action of actions) void routeLaunchAction(action);
      })
      .catch(() => {});
  };

  const listening = android ? listenPlayerEvent("launch-intent", drain) : listenLaunchPending(drain);
  void listening
    .then((unlisten) => {
      if (live) stop = unlisten;
      else unlisten();
    })
    .catch(() => {});
  drain();

  return () => {
    live = false;
    stop?.();
  };
}
