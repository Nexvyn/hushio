import { create } from "zustand";

export type ToastKind = "info" | "success" | "error" | "warning";

export type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
  duration?: number;
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
  contextMenu: unknown;
  playlistPicker: unknown;
  dialog: DialogRequest | null;
  toast: (message: string, kind?: ToastKind, duration?: number) => void;
  dismissToast: (id: number) => void;
  setOsFullscreen: (value: boolean) => void;
  toggleNowPlaying: () => void;
  closePanels: () => void;
  openDialog: (request: DialogRequest) => void;
  closeDialog: () => void;
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

  toast: (message, kind = "info", duration = DEFAULT_TOAST_MS) =>
    set((state) => {
      const next = { id: nextToastId++, message, kind, duration };
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

  toggleNowPlaying: () => set((state) => ({ nowPlayingOpen: !state.nowPlayingOpen })),

  closePanels: () =>
    set({ rightPanel: "details", lyricsCenter: false, nowPlayingOpen: false }),

  openDialog: (request) => set({ dialog: request }),

  closeDialog: () => set({ dialog: null }),
}));
