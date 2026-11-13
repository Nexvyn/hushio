import { describe, expect, it } from "vitest";
import {
  GOOGLE_GENERIC_TEXT,
  GOOGLE_NETWORK_TEXT,
  gateFor,
  googleErrorText,
  initialOnboarding,
  isCancelledSignIn,
  onboardingReducer,
  setOnboardingIntent,
  takeOnboardingIntent,
} from "./onboarding";

const base = { loaded: true, onboardingDone: true, freshInstall: false, mode: "google" as const, intent: null };

describe("onboarding state machine", () => {
  it("a signed-in Google account goes to restoring and shows the sync progress before the shell", () => {
    let state = initialOnboarding("choose");
    state = onboardingReducer(state, { type: "googleStart" });
    expect(state.busy).toBe(true);
    state = onboardingReducer(state, { type: "googleSignedIn" });
    expect(state.screen).toBe("restoring");
    expect(state.dir).toBe("fwd");
    expect(state.turn).toBe(1);
    expect(state.syncDone).toBe(false);
    state = onboardingReducer(state, { type: "syncFinished", error: null });
    expect(state.syncDone).toBe(true);
  });

  it("a cancelled browser returns to choose with no error", () => {
    let state = onboardingReducer(initialOnboarding("choose"), { type: "googleStart" });
    state = onboardingReducer(state, { type: "googleCancelled" });
    expect(state).toMatchObject({ screen: "choose", busy: false, error: null });
  });

  it("other sign-in errors show mapped text and clear busy", () => {
    const state = onboardingReducer(initialOnboarding("choose"), {
      type: "googleFailed",
      message: "connection reset",
    });
    expect(state.busy).toBe(false);
    expect(state.error).toBe(GOOGLE_NETWORK_TEXT);
  });

  it("resume to choose moves backward and does not keep the error", () => {
    let state = initialOnboarding("resume");
    state = onboardingReducer(state, { type: "googleFailed", message: "boom" });
    state = onboardingReducer(state, { type: "resumeToChoose" });
    expect(state).toMatchObject({ screen: "choose", dir: "back", turn: -1, error: null });
  });

  it("a sync failure is kept on the restoring screen", () => {
    let state = onboardingReducer(initialOnboarding("choose"), { type: "googleSignedIn" });
    state = onboardingReducer(state, { type: "syncFinished", error: "Sync failed" });
    expect(state).toMatchObject({ syncDone: true, syncError: "Sync failed" });
  });
});

describe("sign-in error text", () => {
  it("maps network failures and falls back to the generic text", () => {
    expect(googleErrorText("Network is unreachable")).toBe(GOOGLE_NETWORK_TEXT);
    expect(googleErrorText("timed out after 30 s")).toBe(GOOGLE_NETWORK_TEXT);
    expect(googleErrorText("bad state")).toBe(GOOGLE_GENERIC_TEXT);
  });

  it("recognises a cancelled sign-in by its text", () => {
    expect(isCancelledSignIn("Sign-in cancelled.")).toBe(true);
    expect(isCancelledSignIn("Network is unreachable")).toBe(false);
  });
});

describe("session gate (3.2)", () => {
  it("renders nothing decided until the session is loaded", () => {
    expect(gateFor({ ...base, loaded: false })).toEqual({ kind: "loading" });
  });

  it("shows onboarding choose when onboarding was never finished", () => {
    expect(gateFor({ ...base, onboardingDone: false, mode: null })).toEqual({
      kind: "onboarding",
      initial: "choose",
    });
  });

  it("opens the intent screen first when one is waiting", () => {
    expect(gateFor({ ...base, onboardingDone: false, intent: "restoring" })).toEqual({
      kind: "onboarding",
      initial: "restoring",
    });
  });

  it("shows resume for a guest on a fresh install with a finished onboarding flag", () => {
    expect(gateFor({ ...base, mode: "guest", freshInstall: true })).toEqual({
      kind: "onboarding",
      initial: "resume",
    });
  });

  it("opens the shell for a returning guest and for a signed-in account", () => {
    expect(gateFor({ ...base, mode: "guest", freshInstall: false })).toEqual({ kind: "shell" });
    expect(gateFor({ ...base, freshInstall: true })).toEqual({ kind: "shell" });
  });
});

describe("onboarding intent memory (F-229)", () => {
  it("is one-shot: the screen is taken once and then cleared", () => {
    setOnboardingIntent("resume");
    expect(takeOnboardingIntent()).toBe("resume");
    expect(takeOnboardingIntent()).toBeNull();
  });
});
