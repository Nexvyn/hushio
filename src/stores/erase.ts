import { create } from "zustand";
import {
  eraseDriveFiles,
  eraseKeyring,
  eraseLocalData,
  eraseResumeSync,
  eraseRevoke,
  eraseStopSync,
  eraseYoutubePlaylists,
} from "../lib/bridge";
import type { EraseSteps } from "../lib/disconnect";
import { useLibrary } from "./library";

export type EraseMode = "google" | "guest" | "reset";

type EraseState = {
  mode: EraseMode | null;
  open: (mode: EraseMode) => void;
  close: () => void;
};

export const useErase = create<EraseState>()((set) => ({
  mode: null,
  open: (mode) => set({ mode }),
  close: () => set({ mode: null }),
}));

function downloadPaths(): string[] {
  return Object.values(useLibrary.getState().downloads)
    .map((item) => item.path)
    .filter((path): path is string => Boolean(path));
}

export function bridgeSteps(): EraseSteps {
  return {
    stopSync: eraseStopSync,
    resumeSync: eraseResumeSync,
    deleteYoutubePlaylists: eraseYoutubePlaylists,
    deleteDriveFiles: eraseDriveFiles,
    revokeTokens: eraseRevoke,
    removeKeyring: eraseKeyring,
    wipeLocal: (deleteDownloads) =>
      eraseLocalData(deleteDownloads, deleteDownloads ? downloadPaths() : []),
  };
}
