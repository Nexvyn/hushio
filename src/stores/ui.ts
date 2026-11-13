import { create } from "zustand";
import type { IconSvgElement } from "@hugeicons/react";
import type { Box } from "../lib/pickerLayout";
import type { SearchFilter } from "../lib/searchParse";
import type { Track } from "../types";

export type MenuSubject = { title: string; subtitle?: string; thumb?: string | null; round?: boolean };

export type MenuItem = {
  label: string;
  icon?: IconSvgElement;
  note?: string;
  trailing?: string;
  onSelect?: (anchor?: Box) => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  toggle?: boolean;
  header?: boolean;
  separatorBefore?: boolean;
  children?: MenuItem[];
  subject?: MenuSubject;
};

export type ContextMenuOptions = { above?: boolean; alignRight?: boolean; owner?: string; attached?: boolean };

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
  validate?: (value: string) => string | null;
  onConfirm: (value: string) => void;
};

const TOAST_LIMIT = 4;
export const DEFAULT_TOAST_MS = 4600;

let nextToastId = 1;

type UIState = {
  rightPanel: "details" | "queue";
  railSheetOpen: boolean;
  setRailSheetOpen: (open: boolean) => void;
  lyricsCenter: boolean;
  nowPlayingOpen: boolean;
  phoneQueueOpen: boolean;
  phoneLyricsSearchOpen: boolean;
  osFullscreen: boolean;
  toasts: Toast[];
  pendingToasts: Toast[];
  contextMenu: ContextMenuState | null;
  openContextMenu: (x: number, y: number, items: MenuItem[], options?: ContextMenuOptions) => void;
  closeContextMenu: () => void;
  playlistPicker: Track[] | null;
  playlistPickerAnchor: Box | null;
  dialog: DialogRequest | null;
  searchQuery: string;
  searchFilter: SearchFilter;
  setSearchQuery: (query: string) => void;
  setSearchFilter: (filter: SearchFilter) => void;
  toast: (message: string, kind?: ToastKind, duration?: number, action?: ToastAction) => number;
  dismissToast: (id: number) => void;
  setOsFullscreen: (value: boolean) => void;
  setRightPanel: (panel: "details" | "queue") => void;
  toggleQueue: () => void;
  toggleLyrics: () => void;
  closeLyrics: () => void;
  toggleNowPlaying: () => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  openPhoneQueue: () => void;
  closePhoneQueue: () => void;
  openPhoneLyricsSearch: () => void;
  closePhoneLyricsSearch: () => void;
  closePanels: () => void;
  openDialog: (request: DialogRequest) => void;
  closeDialog: () => void;
  openPlaylistPicker: (tracks: Track[], anchor?: Box | null) => void;
  closePlaylistPicker: () => void;
};

export const useUI = create<UIState>()((set) => ({
  rightPanel: "details",
  railSheetOpen: false,
  setRailSheetOpen: (open) => set({ railSheetOpen: open }),
  lyricsCenter: false,
  nowPlayingOpen: false,
  phoneQueueOpen: false,
  phoneLyricsSearchOpen: false,
  osFullscreen: false,
  toasts: [],
  pendingToasts: [],
  contextMenu: null,
  playlistPicker: null,
  playlistPickerAnchor: null,
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

  toast: (message, kind = "info", duration = DEFAULT_TOAST_MS, action) => {
    const id = nextToastId++;
    set((state) => {
      const next = { id, message, kind, duration, action };
      if (state.toasts.length < TOAST_LIMIT) {
        return { toasts: [...state.toasts, next] };
      }
      return { pendingToasts: [...state.pendingToasts, next] };
    });
    return id;
  },

  dismissToast: (id) =>
    set((state) => {
      const queued = state.pendingToasts.filter((item) => item.id !== id);
      if (!state.toasts.some((item) => item.id === id)) {
        return queued.length === state.pendingToasts.length ? state : { pendingToasts: queued };
      }
      const toasts = state.toasts.filter((item) => item.id !== id);
      const next = queued[0];
      return {
        toasts: next ? [...toasts, next] : toasts,
        pendingToasts: next ? queued.slice(1) : queued,
      };
    }),

  setOsFullscreen: (value) => set({ osFullscreen: value }),

  setRightPanel: (panel) => set({ rightPanel: panel }),

  toggleQueue: () =>
    set((state) => {
      const queueVisible = state.rightPanel === "queue" && state.railSheetOpen;
      return { rightPanel: queueVisible ? "details" : "queue", railSheetOpen: !queueVisible };
    }),

  toggleLyrics: () => set((state) => ({ lyricsCenter: !state.lyricsCenter })),

  closeLyrics: () => set({ lyricsCenter: false }),

  toggleNowPlaying: () => set((state) => ({ nowPlayingOpen: !state.nowPlayingOpen })),

  openNowPlaying: () => set({ nowPlayingOpen: true }),

  closeNowPlaying: () => set({ nowPlayingOpen: false }),

  openPhoneQueue: () => set({ phoneQueueOpen: true }),

  closePhoneQueue: () => set({ phoneQueueOpen: false }),

  openPhoneLyricsSearch: () => set({ phoneLyricsSearchOpen: true }),

  closePhoneLyricsSearch: () => set({ phoneLyricsSearchOpen: false }),

  closePanels: () =>
    set({ rightPanel: "details", lyricsCenter: false, nowPlayingOpen: false }),

  openDialog: (request) => set({ dialog: request }),

  closeDialog: () => set({ dialog: null }),

  openPlaylistPicker: (tracks, anchor = null) => {
    if (tracks.length > 0) set({ playlistPicker: tracks, playlistPickerAnchor: anchor });
  },

  closePlaylistPicker: () => set({ playlistPicker: null, playlistPickerAnchor: null }),
}));
