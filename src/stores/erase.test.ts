import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  persistRead: vi.fn(),
  persistWrite: vi.fn(),
  googleAccountGet: vi.fn(),
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  persistRead: bridge.persistRead,
  persistWrite: bridge.persistWrite,
  googleAccountGet: bridge.googleAccountGet,
}));

vi.mock("../lib/audio", async (importOriginal) => ({ ...(await importOriginal<typeof import("../lib/audio")>()), pause: vi.fn() }));

import { resetStoresAfterErase } from "./erase";
import { useLibrary } from "./library";
import { useSession } from "./session";
import { useSettings } from "./settings";
import { GUEST_ACCOUNT } from "./auth";
import { takeOnboardingIntent } from "../lib/onboarding";

describe("erase without reload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.persistRead.mockResolvedValue(null);
    bridge.persistWrite.mockResolvedValue(true);
    bridge.googleAccountGet.mockResolvedValue(GUEST_ACCOUNT);
  });

  it("resets the in-memory stores to their defaults and returns the session to onboarding", () => {
    const initialLibrary = useLibrary.getInitialState();
    useLibrary.setState({ ...initialLibrary, liked: ["song-1"] } as never);
    useSession.setState({ loaded: true, onboardingDone: true, freshInstall: true });

    resetStoresAfterErase();

    expect(useLibrary.getState()).toMatchObject({ liked: initialLibrary.liked });
    expect(useSession.getState()).toMatchObject({ onboardingDone: false, freshInstall: false });
    expect(useSettings.getState().theme).toBe(useSettings.getInitialState().theme);
    expect(bridge.googleAccountGet).toHaveBeenCalled();
  });

  it("the guest sign-in action opens onboarding at choose through the intent memory", () => {
    useSession.setState({ loaded: true, onboardingDone: true, freshInstall: false });
    useSession.getState().openOnboarding("choose");
    expect(useSession.getState().onboardingDone).toBe(false);
    expect(takeOnboardingIntent()).toBe("choose");
  });
});
