import { create } from "zustand";
import type { IconSvgElement } from "@hugeicons/react";
import type { SearchFilter } from "../lib/searchParse";
import type { Track } from "../types";

export type MenuSubject = { title: string; subtitle?: string; thumb?: string | null; round?: boolean };

export type MenuItem = {
  label: string;
  icon?: IconSvgElement;
  note?: string;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  toggle?: boolean;
  header?: boolean;
  separatorBefore?: boolean;
  children?: MenuItem[];
  subject?: MenuSubject;
};

export type ContextMenuOptions = { above?: boolean; alignRight?: boolean; owner?: string };

export type ContextMenuState = ContextMenuOptions & { items: MenuItem[]; x: number; y: number };

export type ToastKind = "info" | "success" | "error" | "warning";

export type ToastAction = { label: string; run: () => void };

export type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
  duration?: number;
  action?: ToastAction;
};

export type DialogRequest = {
  title: string;
  body?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  notice?: boolean;
  multiline?: boolean;
  onConfirm: (value: string) => void;
};

const TOAST_LIMIT = 4;
export const DEFAULT_TOAST_MS = 4600;

let nextToastId = 1;

type UIState = {
  rightPanel: "details" | "queue";
  lyricsCenter: boolean;
  nowPlayingOpen: boolean;
  osFullscreen: boolean;
  toasts: Toast[];
  pendingToasts: Toast[];
  contextMenu: ContextMenuState | null;
  openContextMenu: (x: number, y: number, items: MenuItem[], options?: ContextMenuOptions) => void;
  closeContextMenu: () => void;
  playlistPicker: Track[] | null;
  dialog: DialogRequest | null;
  searchQuery: string;
  searchFilter: SearchFilter;
  setSearchQuery: (query: string) => void;
  setSearchFilter: (filter: SearchFilter) => void;
  toast: (message: string, kind?: ToastKind, duration?: number, action?: ToastAction) => void;
  dismissToast: (id: number) => void;
  setOsFullscreen: (value: boolean) => void;
  setRightPanel: (panel: "details" | "queue") => void;
  toggleQueue: () => void;
  toggleLyrics: () => void;
  toggleNowPlaying: () => void;
  closePanels: () => void;
  openDialog: (request: DialogRequest) => void;
  closeDialog: () => void;
  openPlaylistPicker: (tracks: Track[]) => void;
  closePlaylistPicker: () => void;
};

export const useUI = create<UIState>()((set) => ({
  rightPanel: "details",
  lyricsCenter: false,
  nowPlayingOpen: false,
  osFullscreen: false,
  toasts: [],
  pendingToasts: [],
  contextMenu: null,
  playlistPicker: null,
  dialog: null,
  searchQuery: "",
  searchFilter: "all",

  openContextMenu: (x, y, items, options = {}) => {
    if (items.length === 0) return;
    set({ contextMenu: { ...options, items, x, y } });
  },

  closeContextMenu: () => set({ contextMenu: null }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSearchFilter: (filter) => set({ searchFilter: filter }),

  toast: (message, kind = "info", duration = DEFAULT_TOAST_MS, action) =>
    set((state) => {
      const next = { id: nextToastId++, message, kind, duration, action };
      if (state.toasts.length < TOAST_LIMIT) {
        return { toasts: [...state.toasts, next] };
      }
      return { pendingToasts: [...state.pendingToasts, next] };
    }),

  dismissToast: (id) =>
    set((state) => {
      const toasts = state.toasts.filter((item) => item.id !== id);
      if (toasts.length === state.toasts.length) return state;
      const next = state.pendingToasts[0];
      return {
        toasts: next ? [...toasts, next] : toasts,
        pendingToasts: next ? state.pendingToasts.slice(1) : state.pendingToasts,
      };
    }),

  setOsFullscreen: (value) => set({ osFullscreen: value }),

  setRightPanel: (panel) => set({ rightPanel: panel }),

  toggleQueue: () =>
    set((state) => ({ rightPanel: state.rightPanel === "queue" ? "details" : "queue" })),

  toggleLyrics: () => set((state) => ({ lyricsCenter: !state.lyricsCenter })),

  toggleNowPlaying: () => set((state) => ({ nowPlayingOpen: !state.nowPlayingOpen })),

  closePanels: () =>
    set({ rightPanel: "details", lyricsCenter: false, nowPlayingOpen: false }),

  openDialog: (request) => set({ dialog: request }),

  closeDialog: () => set({ dialog: null }),

  openPlaylistPicker: (tracks) => {
    if (tracks.length > 0) set({ playlistPicker: tracks });
  },

  closePlaylistPicker: () => set({ playlistPicker: null }),
}));
