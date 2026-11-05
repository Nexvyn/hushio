import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  persistRead: vi.fn(),
  persistWrite: vi.fn(),
  guestDetectMarker: vi.fn(),
}));

vi.mock("../lib/bridge", () => bridge);

import { useSession } from "./session";

describe("session store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.persistWrite.mockResolvedValue(true);
    useSession.setState({ loaded: false, onboardingDone: false, freshInstall: false });
  });

  it("reads the onboarding flag from the guest owner and the install marker", async () => {
    bridge.persistRead.mockResolvedValue({ done: true });
    bridge.guestDetectMarker.mockResolvedValue(true);
    await useSession.getState().load();
    expect(bridge.persistRead).toHaveBeenCalledWith("onboarding", "guest");
    expect(useSession.getState()).toMatchObject({ loaded: true, onboardingDone: true, freshInstall: true });
  });

  it("treats a missing flag as not onboarded, which is what erase leaves behind", async () => {
    bridge.persistRead.mockResolvedValue(null);
    bridge.guestDetectMarker.mockResolvedValue(false);
    await useSession.getState().load();
    expect(useSession.getState()).toMatchObject({ loaded: true, onboardingDone: false, freshInstall: false });
  });

  it("a failed read falls back to onboarding instead of an empty shell", async () => {
    bridge.persistRead.mockRejectedValue(new Error("disk"));
    bridge.guestDetectMarker.mockRejectedValue(new Error("no marker"));
    await useSession.getState().load();
    expect(useSession.getState()).toMatchObject({ loaded: true, onboardingDone: false, freshInstall: false });
  });

  it("completing onboarding persists the flag and clears the fresh-install state", async () => {
    useSession.setState({ loaded: true, onboardingDone: false, freshInstall: true });
    await useSession.getState().completeOnboarding();
    expect(bridge.persistWrite).toHaveBeenCalledWith("onboarding", { done: true }, "guest");
    expect(useSession.getState()).toMatchObject({ onboardingDone: true, freshInstall: false });
  });
});
