import { create } from "zustand";
import {
  googleAccountGet,
  googleSignIn,
  googleSignInCancel,
  googleSignOut,
  listenGoogleAuthChanged,
  type GoogleAccount,
} from "../lib/bridge";
import { useUI } from "./ui";

export const GUEST_ACCOUNT: GoogleAccount = {
  mode: "guest",
  googleSub: null,
  name: null,
  email: null,
  pictureUrl: null,
  configured: false,
  keyringAvailable: true,
};

const SESSION_ENDED = "Your Google session ended. Sign in again to keep your library in sync.";
const SIGNED_OUT = "Signed out. Sync is off.";
const SIGN_OUT_BODY =
  "Your library stays on this computer. Sync stops until you sign in again. Your playlists stay on YouTube and your settings stay in your Google Drive.";

type AuthState = {
  account: GoogleAccount;
  loaded: boolean;
  signingIn: boolean;
  load: () => Promise<void>;
  signIn: () => Promise<void>;
  cancelSignIn: () => Promise<void>;
  requestSignOut: () => void;
  signOut: () => Promise<void>;
  apply: (account: GoogleAccount) => void;
};

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toast(message: string, kind: "success" | "error") {
  useUI.getState().toast(message, kind);
}

let inFlight: Promise<void> | null = null;
let activeAttempt: { cancelled: boolean } | null = null;

export const useAuth = create<AuthState>()((set, get) => ({
  account: GUEST_ACCOUNT,
  loaded: false,
  signingIn: false,

  load: async () => {
    try {
      set({ account: await googleAccountGet(), loaded: true });
    } catch (error) {
      set({ loaded: true });
      toast(errorText(error), "error");
    }
  },

  signIn: () => {
    if (inFlight) return inFlight;
    const attempt = { cancelled: false };
    activeAttempt = attempt;
    set({ signingIn: true });
    inFlight = googleSignIn()
      .then((account) => {
        if (!attempt.cancelled) set({ account });
      })
      .catch((error: unknown) => {
        if (!attempt.cancelled) toast(errorText(error), "error");
      })
      .finally(() => {
        if (activeAttempt === attempt) {
          inFlight = null;
          activeAttempt = null;
          set({ signingIn: false });
        }
      });
    return inFlight;
  },

  cancelSignIn: async () => {
    if (activeAttempt) activeAttempt.cancelled = true;
    activeAttempt = null;
    inFlight = null;
    set({ signingIn: false });
    await googleSignInCancel();
  },

  requestSignOut: () => {
    useUI.getState().openDialog({
      title: "Sign out of Hushio?",
      body: SIGN_OUT_BODY,
      confirmLabel: "Sign out",
      cancelLabel: "Cancel",
      onConfirm: () => {
        void get().signOut();
      },
    });
  },

  signOut: async () => {
    try {
      set({ account: await googleSignOut() });
      toast(SIGNED_OUT, "success");
    } catch (error) {
      toast(errorText(error), "error");
    }
  },

  apply: (account) => {
    const previous = get().account;
    set({ account });
    if (previous.mode === "google" && account.mode === "guest") toast(SESSION_ENDED, "error");
  },
}));

export function startGoogleAuth(): () => void {
  let stop: (() => void) | undefined;
  let live = true;
  listenGoogleAuthChanged((account) => useAuth.getState().apply(account))
    .then((unlisten) => {
      if (live) stop = unlisten;
      else unlisten();
    })
    .catch((error: unknown) => toast(errorText(error), "error"));
  void useAuth.getState().load();
  return () => {
    live = false;
    stop?.();
  };
}
