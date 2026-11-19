import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const bridge = vi.hoisted(() => ({
  googleSignIn: vi.fn(),
  persistRead: vi.fn(),
  persistWrite: vi.fn(),
  guestDetectMarker: vi.fn(),
  introDone: vi.fn(),
  ytSyncNow: vi.fn(),
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  ...bridge,
}));

import { GOOGLE_GENERIC_TEXT, GOOGLE_NETWORK_TEXT } from "../lib/onboarding";
import { useAuth, GUEST_ACCOUNT } from "../stores/auth";
import { useSession } from "../stores/session";
import { Onboarding } from "./Onboarding";

const googleAccount = {
  mode: "google" as const,
  googleSub: "sub-1",
  name: "Listener",
  email: "listener@example.com",
  pictureUrl: null,
  configured: true,
  keyringAvailable: true,
};

const idleYt = {
  state: "idle",
  done: 0,
  total: 0,
  playlistName: null,
  backend: "official",
  quotaUsedToday: 0,
  quotaLimit: 10000,
  failedJobs: 0,
  lastError: null,
  lastSyncedAt: null,
  pulledPlaylists: 0,
};

function expectNamedControlsAndSizedIcons() {
  for (const control of screen.queryAllByRole("button")) {
    const name = control.getAttribute("aria-label") ?? control.textContent ?? "";
    expect(name.trim(), "button name").not.toBe("");
  }
  const icons = Array.from(document.querySelectorAll("svg"));
  expect(icons.length).toBeGreaterThan(0);
  for (const icon of icons) {
    if (icon.closest(".app-logo")) continue;
    expect(icon.getAttribute("width")).toBe("20");
    expect(icon.getAttribute("height")).toBe("20");
  }
}

describe("Onboarding", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    bridge.persistWrite.mockResolvedValue(true);
    bridge.persistRead.mockResolvedValue(null);
    bridge.ytSyncNow.mockResolvedValue(idleYt);
    useSession.setState({ loaded: true, onboardingDone: false, freshInstall: false });
    useAuth.setState({ account: GUEST_ACCOUNT, loaded: true, signingIn: false });
  });

  it("choose: both ways in are named buttons with 20 px icons", () => {
    render(<Onboarding initial="choose" />);
    screen.getByRole("heading", { name: /Stream what's new\./ });
    screen.getByRole("button", { name: /Continue with Google/ });
    screen.getByRole("button", { name: /Continue as guest/ });
    expectNamedControlsAndSizedIcons();
  });

  it("guest start persists the onboarding flag under the guest owner", async () => {
    const user = userEvent.setup();
    render(<Onboarding initial="choose" />);
    await user.click(screen.getByRole("button", { name: /Continue as guest/ }));
    expect(bridge.persistWrite).toHaveBeenCalledWith("onboarding", { done: true }, "guest");
    expect(useSession.getState().onboardingDone).toBe(true);
  });

  it("Google sign-in shows the syncing screen and only then allows Continue", async () => {
    const user = userEvent.setup();
    bridge.googleSignIn.mockResolvedValue(googleAccount);
    render(<Onboarding initial="choose" />);
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));

    const continueButton = await screen.findByRole("button", { name: "Continue" });
    await vi.waitFor(() => expect((continueButton as HTMLButtonElement).disabled).toBe(false));
    expect(useAuth.getState().account.mode).toBe("google");
    expect(screen.getByRole("heading", { name: "Syncing your library" })).toBeTruthy();
    expectNamedControlsAndSizedIcons();

    await user.click(continueButton);
    expect(bridge.persistWrite).toHaveBeenCalledWith("onboarding", { done: true }, "guest");
  });

  it("a cancelled browser goes back to choose with no error", async () => {
    const user = userEvent.setup();
    bridge.googleSignIn.mockRejectedValue(new Error("Sign-in cancelled."));
    render(<Onboarding initial="choose" />);
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));
    await vi.waitFor(() =>
      expect((screen.getByRole("button", { name: /Continue with Google/ }) as HTMLButtonElement).disabled).toBe(false),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a network failure shows the mapped sign-in text in an alert", async () => {
    const user = userEvent.setup();
    bridge.googleSignIn.mockRejectedValue(new Error("Network error while contacting Google"));
    render(<Onboarding initial="choose" />);
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect((await screen.findByRole("alert")).textContent).toBe(GOOGLE_NETWORK_TEXT);
  });

  it("any other failure shows the generic text", async () => {
    const user = userEvent.setup();
    bridge.googleSignIn.mockRejectedValue(new Error("Something broke"));
    render(<Onboarding initial="choose" />);
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect((await screen.findByRole("alert")).textContent).toBe(GOOGLE_GENERIC_TEXT);
  });

  it("resume offers guest first, then Google through choose", async () => {
    const user = userEvent.setup();
    bridge.googleSignIn.mockReturnValue(new Promise(() => {}));
    render(<Onboarding initial="resume" />);
    const resume = screen.getByRole("heading", { name: "Your guest library is still here" });
    expect(resume).toBeTruthy();
    expectNamedControlsAndSizedIcons();

    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    await screen.findByRole("heading", { name: /Stream what's new\./ });
    expect(bridge.googleSignIn).toHaveBeenCalledTimes(1);
  });

  it("resume continues as guest and keeps the library", async () => {
    const user = userEvent.setup();
    render(<Onboarding initial="resume" />);
    const card = screen.getByRole("heading", { name: "Your guest library is still here" }).parentElement;
    await user.click(within(card as HTMLElement).getByRole("button", { name: "Continue as guest" }));
    expect(bridge.persistWrite).toHaveBeenCalledWith("onboarding", { done: true }, "guest");
  });
});
