import { create } from "zustand";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import type { Box } from "../lib/pickerLayout";
import type { SearchFilter } from "../lib/searchParse";
import { sameToast } from "../lib/toastStack";
import type { Track } from "../types";

export type MenuSubject = { title: string; subtitle?: string; thumb?: string | null; round?: boolean };

export type MenuItem = {
  label: string;
  icon?: PhosphorIcon;
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

type ToastOptions = { art?: string; detail?: string; progress?: number };

type ToastPatch = Partial<Pick<Toast, "message" | "kind" | "art" | "detail" | "progress">>;

export type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
  duration?: number;
  action?: ToastAction;
  art?: string;
  detail?: string;
  progress?: number;
  bump?: number;
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

const TOAST_LIMIT = 3;

let nextToastId = 1;

function bumpToast(existing: Toast, incoming: Toast): Toast {
  return {
    ...existing,
    art: incoming.art,
    detail: incoming.detail,
    progress: incoming.progress,
    action: incoming.action ?? existing.action,
    duration: incoming.duration ?? existing.duration,
    bump: (existing.bump ?? 0) + 1,
  };
}

type UIState = {
  rightPanel: "details" | "queue";
  railSheetOpen: boolean;
  railColumnOpen: boolean;
  libraryCollapsed: boolean;
  setLibraryCollapsed: (value: boolean) => void;
  setRailSheetOpen: (open: boolean) => void;
  lyricsCenter: boolean;
  nowPlayingOpen: boolean;
  phoneQueueOpen: boolean;
  phoneLyricsOpen: boolean;
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
  searchFocused: boolean;
  setSearchFocused: (focused: boolean) => void;
  setSearchQuery: (query: string) => void;
  setSearchFilter: (filter: SearchFilter) => void;
  toast: (message: string, kind?: ToastKind, duration?: number, action?: ToastAction, options?: ToastOptions) => number;
  updateToast: (id: number, patch: ToastPatch) => void;
  dismissToast: (id: number) => void;
  setOsFullscreen: (value: boolean) => void;
  setRightPanel: (panel: "details" | "queue") => void;
  toggleQueue: (sheet?: boolean) => void;
  closeRail: (sheet?: boolean) => void;
  toggleLyrics: () => void;
  closeLyrics: () => void;
  toggleNowPlaying: () => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  openPhoneQueue: () => void;
  closePhoneQueue: () => void;
  openPhoneLyrics: () => void;
  closePhoneLyrics: () => void;
  closePanels: () => void;
  openDialog: (request: DialogRequest) => void;
  closeDialog: () => void;
  openPlaylistPicker: (tracks: Track[], anchor?: Box | null) => void;
  closePlaylistPicker: () => void;
};

export const useUI = create<UIState>()((set) => ({
  rightPanel: "details",
  railSheetOpen: false,
  railColumnOpen: true,
  libraryCollapsed: false,
  setLibraryCollapsed: (value) => set({ libraryCollapsed: value }),
  setRailSheetOpen: (open) => set({ railSheetOpen: open }),
  lyricsCenter: false,
  nowPlayingOpen: false,
  phoneQueueOpen: false,
  phoneLyricsOpen: false,
  osFullscreen: false,
  toasts: [],
  pendingToasts: [],
  contextMenu: null,
  playlistPicker: null,
  playlistPickerAnchor: null,
  dialog: null,
  searchQuery: "",
  searchFilter: "all",
  searchFocused: false,

  openContextMenu: (x, y, items, options = {}) => {
    if (items.length === 0) return;
    set({ contextMenu: { ...options, items, x, y } });
  },

  closeContextMenu: () => set({ contextMenu: null }),

  setSearchFocused: (focused) => set({ searchFocused: focused }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSearchFilter: (filter) => set({ searchFilter: filter }),

  toast: (message, kind = "info", duration, action, options = {}) => {
    const id = nextToastId++;
    let shownId = id;
    set((state) => {
      const incoming: Toast = { id, message, kind, duration, action, ...options };
      const shown = state.toasts.findIndex((item) => sameToast(item, incoming));
      if (shown !== -1) {
        shownId = state.toasts[shown].id;
        const toasts = [...state.toasts];
        toasts[shown] = bumpToast(state.toasts[shown], incoming);
        return { toasts };
      }
      const waiting = state.pendingToasts.findIndex((item) => sameToast(item, incoming));
      if (waiting !== -1) {
        shownId = state.pendingToasts[waiting].id;
        const pendingToasts = [...state.pendingToasts];
        pendingToasts[waiting] = bumpToast(state.pendingToasts[waiting], incoming);
        return { pendingToasts };
      }
      if (state.toasts.length < TOAST_LIMIT) {
        return { toasts: [...state.toasts, incoming] };
      }
      return { pendingToasts: [...state.pendingToasts, incoming] };
    });
    return shownId;
  },

  updateToast: (id, patch) =>
    set((state) => ({
      toasts: state.toasts.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      pendingToasts: state.pendingToasts.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    })),

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

  toggleQueue: (sheet = false) =>
    set((state) => {
      if (sheet) {
        const showingQueue = state.railSheetOpen && state.rightPanel === "queue";
        return { railSheetOpen: true, rightPanel: showingQueue ? "details" : "queue" };
      }
      const showingQueue = state.railColumnOpen && state.rightPanel === "queue";
      return { railColumnOpen: true, rightPanel: showingQueue ? "details" : "queue" };
    }),

  closeRail: (sheet = false) =>
    set(sheet ? { railSheetOpen: false, rightPanel: "details" } : { railColumnOpen: false, rightPanel: "details" }),

  toggleLyrics: () => set((state) => ({ lyricsCenter: !state.lyricsCenter })),

  closeLyrics: () => set({ lyricsCenter: false }),

  toggleNowPlaying: () => set((state) => ({ nowPlayingOpen: !state.nowPlayingOpen })),

  openNowPlaying: () => set({ nowPlayingOpen: true }),

  closeNowPlaying: () => set({ nowPlayingOpen: false }),

  openPhoneQueue: () => set({ phoneQueueOpen: true }),

  closePhoneQueue: () => set({ phoneQueueOpen: false }),

  openPhoneLyrics: () => set({ phoneLyricsOpen: true }),

  closePhoneLyrics: () => set({ phoneLyricsOpen: false }),

  closePanels: () =>
    set({ rightPanel: "details", lyricsCenter: false, nowPlayingOpen: false }),

  openDialog: (request) => set({ dialog: request }),

  closeDialog: () => set({ dialog: null }),

  openPlaylistPicker: (tracks, anchor = null) => {
    if (tracks.length > 0) set({ playlistPicker: tracks, playlistPickerAnchor: anchor });
  },

  closePlaylistPicker: () => set({ playlistPicker: null, playlistPickerAnchor: null }),
}));
