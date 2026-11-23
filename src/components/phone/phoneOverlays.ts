import { usePlaylistEdit } from "../../stores/playlistEdit";
import { useSongInfo } from "../../stores/songInfo";
import { useUI } from "../../stores/ui";

type UIState = ReturnType<typeof useUI.getState>;

function sheetIn(ui: UIState, songInfo: boolean, playlistEdit: boolean): boolean {
  return Boolean(
    ui.contextMenu || songInfo || playlistEdit || ui.dialog || ui.playlistPicker || ui.phoneQueueOpen || ui.phoneLyricsOpen,
  );
}

export function useSheetOpen(): boolean {
  const uiOpen = useUI((state) => sheetIn(state, false, false));
  const songInfo = useSongInfo((state) => state.song !== null);
  const playlistEdit = usePlaylistEdit((state) => state.id !== null);
  return uiOpen || songInfo || playlistEdit;
}

export function isSheetOpen(): boolean {
  return sheetIn(useUI.getState(), useSongInfo.getState().song !== null, usePlaylistEdit.getState().id !== null);
}

export function closeTopSheet(): void {
  const ui = useUI.getState();
  if (ui.contextMenu) ui.closeContextMenu();
  else if (useSongInfo.getState().song !== null) useSongInfo.getState().close();
  else if (usePlaylistEdit.getState().id !== null) usePlaylistEdit.getState().close();
  else if (ui.dialog) ui.closeDialog();
  else if (ui.playlistPicker) ui.closePlaylistPicker();
  else if (ui.phoneLyricsOpen) ui.closePhoneLyrics();
  else if (ui.phoneQueueOpen) ui.closePhoneQueue();
}
