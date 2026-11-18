export type Screen = "choose" | "resume" | "restoring";
type Mode = "guest" | "google" | null;

export type OnboardingState = {
  screen: Screen;
  dir: "fwd" | "back";
  turn: number;
  busy: boolean;
  error: string | null;
  syncDone: boolean;
  syncError: string | null;
};

export type OnboardingEvent =
  | { type: "googleStart" }
  | { type: "googleCancelled" }
  | { type: "googleFailed"; message: string }
  | { type: "googleSignedIn" }
  | { type: "syncFinished"; error: string | null }
  | { type: "resumeToChoose" }
  | { type: "guestStart" };

export const GOOGLE_NETWORK_TEXT = "Couldn't connect right now. Check your connection and try again.";
export const GOOGLE_GENERIC_TEXT = "Something went wrong. Please try again.";

export function initialOnboarding(screen: Screen): OnboardingState {
  return {
    screen,
    dir: "fwd",
    turn: 0,
    busy: false,
    error: null,
    syncDone: false,
    syncError: null,
  };
}

export function onboardingReducer(state: OnboardingState, event: OnboardingEvent): OnboardingState {
  switch (event.type) {
    case "googleStart":
      return { ...state, busy: true, error: null };
    case "googleCancelled":
      return { ...state, busy: false, error: null };
    case "googleFailed":
      return { ...state, busy: false, error: googleErrorText(event.message) };
    case "googleSignedIn":
      return {
        ...state,
        busy: false,
        error: null,
        screen: "restoring",
        dir: "fwd",
        turn: state.turn + 1,
        syncDone: false,
        syncError: null,
      };
    case "syncFinished":
      return { ...state, syncDone: true, syncError: event.error };
    case "resumeToChoose":
      return { ...state, screen: "choose", dir: "back", turn: state.turn - 1, error: null };
    case "guestStart":
      return { ...state, busy: true };
  }
}

export function googleErrorText(message: string): string {
  return /network|timed? ?out|connect|dns/i.test(message) ? GOOGLE_NETWORK_TEXT : GOOGLE_GENERIC_TEXT;
}

export function isCancelledSignIn(message: string): boolean {
  return /cancel/i.test(message);
}

export type Gate =
  | { kind: "loading" }
  | { kind: "onboarding"; initial: Screen }
  | { kind: "shell" };

export type GateInput = {
  loaded: boolean;
  onboardingDone: boolean;
  freshInstall: boolean;
  mode: Mode;
  intent: Screen | null;
};

export function gateFor(input: GateInput): Gate {
  if (!input.loaded) return { kind: "loading" };
  if (!input.onboardingDone) return { kind: "onboarding", initial: input.intent ?? "choose" };
  if (input.mode === "guest" && input.freshInstall) return { kind: "onboarding", initial: "resume" };
  return { kind: "shell" };
}

let intent: Screen | null = null;

export function setOnboardingIntent(screen: Screen): void {
  intent = screen;
}

export function takeOnboardingIntent(): Screen | null {
  const value = intent;
  intent = null;
  return value;
}
