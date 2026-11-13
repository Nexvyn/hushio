import { create, type StoreApi } from "zustand";
import {
  eraseKeyring,
  eraseLocalData,
  eraseResumeSync,
  eraseRevoke,
  eraseStopSync,
  eraseYoutubePlaylists,
  pipSessionErased,
} from "../lib/bridge";
import { pause } from "../lib/audio";
import type { EraseSteps } from "../lib/disconnect";
import { useArtistBundles } from "./artistBundles";
import { useArtistMeta } from "./artistMeta";
import { useAuth } from "./auth";
import { useCrashes } from "./crashes";
import { useDiscord } from "./discord";
import { useHomeCache } from "./homeCache";
import { useHomeEngagement } from "./homeEngagement";
import { useLibrary } from "./library";
import { useLyricsNudge } from "./lyricsNudge";
import { useNavigation } from "./navigation";
import { useNetwork } from "./network";
import { usePlayer } from "./player";
import { useRecents, useRecentItems } from "./recents";
import { useScrobble } from "./scrobble";
import { useSession } from "./session";
import { useSettings } from "./settings";
import { useSync } from "./sync";

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
    revokeTokens: eraseRevoke,
    removeKeyring: eraseKeyring,
    wipeLocal: async (deleteDownloads) => {
      await eraseLocalData(deleteDownloads, deleteDownloads ? downloadPaths() : []);
      await pipSessionErased().catch(() => {});
    },
  };
}

function resetStore<T extends object>(store: StoreApi<T>) {
  store.setState(store.getInitialState(), true);
}

export function resetStoresAfterErase(): void {
  pause();
  resetStore(usePlayer);
  resetStore(useLibrary);
  resetStore(useSettings);
  resetStore(useRecents);
  resetStore(useRecentItems);
  resetStore(useArtistMeta);
  resetStore(useArtistBundles);
  resetStore(useHomeCache);
  resetStore(useHomeEngagement);
  resetStore(useLyricsNudge);
  resetStore(useSync);
  resetStore(useScrobble);
  resetStore(useDiscord);
  resetStore(useNetwork);
  resetStore(useCrashes);
  resetStore(useNavigation);
  void useAuth.getState().load();
  useSession.getState().resetAfterErase();
}
