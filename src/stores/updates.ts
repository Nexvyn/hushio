import { create } from "zustand";
import {
  listenUpdates,
  openExternal,
  persistRead,
  persistWrite,
  platform,
  updatesCheck,
  updatesInstall,
  updatesRestart,
  updatesState,
} from "../lib/bridge";
import {
  DOWNLOAD_PAGE,
  INITIAL_UPDATE_STATE,
  RELEASES_PAGE,
  actionLabel,
  noticeText,
  shouldNotify,
  type UpdateState,
} from "../lib/updates";
import { useUI } from "./ui";

const NOTICE_STORE = "updates";
const NOTICE_OWNER = "guest";

type UpdatesStore = {
  state: UpdateState;
  notified: string | null;
  apply: (state: UpdateState) => void;
  check: () => Promise<void>;
  install: () => Promise<void>;
  restart: () => Promise<void>;
  openPage: (url: string) => void;
};

function failInstall(state: UpdateState, message: string): UpdateState {
  return { ...state, status: "error", error: message, errorFrom: "install" };
}

export const useUpdates = create<UpdatesStore>()((set, get) => ({
  state: INITIAL_UPDATE_STATE,
  notified: null,

  apply(state) {
    set({ state });
    if (!shouldNotify(state, get().notified)) return;
    set({ notified: state.version });
    void persistWrite(NOTICE_STORE, { notified: state.version }, NOTICE_OWNER).catch(() => {});
    useUI.getState().toast(noticeText(state), "info", undefined, {
      label: actionLabel(state.route),
      run: () => void get().install(),
    });
  },

  async check() {
    try {
      await updatesCheck();
    } catch (error) {
      get().apply({ ...get().state, status: "error", error: String(error), errorFrom: "check" });
    }
  },

  async install() {
    const { state } = get();
    if (state.route !== "inApp") {
      get().openPage(state.route === "website" ? DOWNLOAD_PAGE : RELEASES_PAGE);
      return;
    }
    try {
      await updatesInstall();
    } catch (error) {
      get().apply(failInstall(state, String(error)));
    }
  },

  async restart() {
    try {
      await updatesRestart();
    } catch (error) {
      get().apply(failInstall(get().state, String(error)));
    }
  },

  openPage(url) {
    void openExternal(url).catch(() => {});
  },
}));

export function startUpdates(): () => void {
  if (platform === "android") return () => {};
  let live = true;
  let stop: (() => void) | undefined;

  void (async () => {
    const stored = await persistRead<{ notified?: string }>(NOTICE_STORE, NOTICE_OWNER).catch(() => null);
    if (!live) return;
    useUpdates.setState({ notified: stored?.notified ?? null });
    const unlisten = await listenUpdates((state) => useUpdates.getState().apply(state));
    if (!live) {
      unlisten();
      return;
    }
    stop = unlisten;
    const state = await updatesState();
    if (live) useUpdates.getState().apply(state);
  })().catch(() => {});

  return () => {
    live = false;
    stop?.();
  };
}
