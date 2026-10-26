import { ListStartIcon, PlayListAddIcon } from "@hugeicons/core-free-icons";
import type { MenuItem } from "../components/ActionMenu";
import { shortTitle } from "./browseText";
import { plural } from "./plural";
import type { SearchSong } from "./searchParse";
import { usePlayer } from "../stores/player";
import { useUI } from "../stores/ui";

export function queueAll(tracks: SearchSong[], message: string): void {
  usePlayer.getState().addToQueue(tracks);
  useUI.getState().toast(message);
}

export function addedMessage(count: number): string {
  return `Added ${plural(count, "song", "songs")} to queue`;
}

export function songMenu(song: SearchSong): MenuItem[] {
  return [
    {
      label: "Play next",
      icon: ListStartIcon,
      onSelect: () => {
        usePlayer.getState().addToQueue([song], true);
        useUI.getState().toast(`"${shortTitle(song.title)}" plays next`);
      },
    },
    {
      label: "Add to queue",
      icon: PlayListAddIcon,
      onSelect: () => {
        const added = usePlayer.getState().addToQueue([song]);
        useUI.getState().toast(added > 0 ? "Added to queue" : "Already in your queue");
      },
    },
  ];
}

export function copyLink(url: string): void {
  navigator.clipboard.writeText(url).then(
    () => useUI.getState().toast("Link copied", "success"),
    () => useUI.getState().toast("Couldn't copy link", "error"),
  );
}
