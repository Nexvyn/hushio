import { create } from "zustand";

export const PLAYLIST_COVER_DIR = "playlist-covers";

type CoverErrors = {
  failed: Readonly<Record<string, true>>;
  fail: (src: string) => void;
};

export const useCoverErrors = create<CoverErrors>()((set, get) => ({
  failed: {},
  fail: (src) => {
    if (get().failed[src]) return;
    set((state) => ({ failed: { ...state.failed, [src]: true } }));
  },
}));

export function useFailedCovers(): Readonly<Record<string, true>> {
  return useCoverErrors((state) => state.failed);
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "error",
    (event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      const src = event.target.getAttribute("src");
      if (src?.includes(PLAYLIST_COVER_DIR)) useCoverErrors.getState().fail(src);
    },
    true,
  );
}
