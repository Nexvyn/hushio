import { toTrack } from "./localLibrary";
import { useLocalLibrary } from "../stores/localLibrary";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";

export const OPENED_FROM = "Opened files";

export async function dropPaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const onLocal = useNavigation.getState().view.name === "local";
  const store = useLocalLibrary.getState();
  const result = await store.openFiles(paths);
  if (onLocal && result.folders.length > 0) {
    await store.importFolders(result.folders);
  }
  if (result.tracks.length > 0) {
    usePlayer.getState().playQueue(result.tracks.map(toTrack), 0, OPENED_FROM);
  }
}
