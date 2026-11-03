import { launchTake, listenLaunchPending, type LaunchAction } from "./bridge";
import { dropPaths } from "./localDrop";
import { useNavigation } from "../stores/navigation";

export function playlistBrowseId(id: string): string {
  return id.startsWith("VL") ? id : `VL${id}`;
}

export async function routeLaunchAction(action: LaunchAction): Promise<void> {
  if (action.type === "file") {
    await dropPaths([action.path]);
    return;
  }
  useNavigation.getState().navigate({ name: "ytplaylist", param: playlistBrowseId(action.id) });
}

export function startLaunchActions(): () => void {
  let live = true;
  let stop: (() => void) | undefined;

  const drain = () => {
    void launchTake()
      .then((actions) => {
        for (const action of actions) void routeLaunchAction(action);
      })
      .catch(() => {});
  };

  void listenLaunchPending(drain)
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
