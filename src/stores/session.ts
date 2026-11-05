import { create } from "zustand";
import { guestDetectMarker, persistRead, persistWrite } from "../lib/bridge";
import { setOnboardingIntent, type Screen } from "../lib/onboarding";
import { useUI } from "./ui";

const ONBOARDING_STORE = "onboarding";
const ONBOARDING_OWNER = "guest";

type SessionState = {
  loaded: boolean;
  onboardingDone: boolean;
  freshInstall: boolean;
  load: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetAfterErase: () => void;
  openOnboarding: (screen: Screen) => void;
};

export const useSession = create<SessionState>()((set) => ({
  loaded: false,
  onboardingDone: false,
  freshInstall: false,

  load: async () => {
    let onboardingDone = false;
    let freshInstall = false;
    try {
      const flag = await persistRead<{ done?: boolean }>(ONBOARDING_STORE, ONBOARDING_OWNER);
      onboardingDone = flag?.done === true;
    } catch {
      onboardingDone = false;
    }
    try {
      freshInstall = await guestDetectMarker();
    } catch {
      freshInstall = false;
    }
    set({ loaded: true, onboardingDone, freshInstall });
  },

  resetAfterErase: () => set({ onboardingDone: false, freshInstall: false }),

  openOnboarding: (screen) => {
    setOnboardingIntent(screen);
    set({ onboardingDone: false });
  },

  completeOnboarding: async () => {
    set({ onboardingDone: true, freshInstall: false });
    try {
      await persistWrite(ONBOARDING_STORE, { done: true }, ONBOARDING_OWNER);
    } catch (error) {
      useUI.getState().toast(error instanceof Error ? error.message : String(error), "error");
    }
  },
}));
