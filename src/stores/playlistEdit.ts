import { create } from "zustand";

type PlaylistEditState = {
  id: string | null;
  open: (id: string) => void;
  close: () => void;
};

export const usePlaylistEdit = create<PlaylistEditState>((set) => ({
  id: null,
  open: (id) => set({ id }),
  close: () => set({ id: null }),
}));
