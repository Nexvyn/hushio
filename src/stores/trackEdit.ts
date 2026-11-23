import { create } from "zustand";

type TrackEditState = {
  id: string | null;
  returnTo: HTMLElement | null;
  open: (id: string) => void;
  close: () => void;
};

function triggerOf(): HTMLElement | null {
  const menuTrigger = document.querySelector<HTMLElement>('[aria-haspopup="menu"][aria-expanded="true"]');
  if (menuTrigger) return menuTrigger;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body || active.closest('[role="menu"]')) return null;
  return active;
}

export const useTrackEdit = create<TrackEditState>((set) => ({
  id: null,
  returnTo: null,
  open: (id) => set({ id, returnTo: triggerOf() }),
  close: () => set({ id: null, returnTo: null }),
}));
