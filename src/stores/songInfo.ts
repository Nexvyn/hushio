import { create } from "zustand";
import type { SearchSong } from "../lib/searchParse";

type SongInfoState = {
  song: SearchSong | null;
  open: (song: SearchSong) => void;
  close: () => void;
};

export const useSongInfo = create<SongInfoState>()((set) => ({
  song: null,
  open: (song) => set({ song }),
  close: () => set({ song: null }),
}));
