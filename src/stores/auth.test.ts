import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  googleAccountGet: vi.fn(),
  googleSignIn: vi.fn(),
  googleSignInCancel: vi.fn(),
  googleSignOut: vi.fn(),
  listenGoogleAuthChanged: vi.fn(),
}));

vi.mock("../lib/bridge", () => ({ platform: "windows", ...bridge }));

import { GUEST_ACCOUNT, startGoogleAuth, useAuth } from "./auth";
import { useUI } from "./ui";
import type { GoogleAccount } from "../lib/bridge";

const initialUI = useUI.getState();

const SIGNED_IN: GoogleAccount = {
  mode: "google",
  googleSub: "sub-1",
  name: "Ada",
  email: "ada@example.com",
  pictureUrl: null,
  configured: true,
  keyringAvailable: true,
};

function messages() {
  return useUI.getState().toasts.map((toast) => toast.message);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState(initialUI, true);
  useAuth.setState({ account: GUEST_ACCOUNT, loaded: false, signingIn: false });
});

describe("auth store", () => {
  it("loads the account from the native side", async () => {
    bridge.googleAccountGet.mockResolvedValue(SIGNED_IN);
    await useAuth.getState().load();
    expect(useAuth.getState().account).toEqual(SIGNED_IN);
    expect(useAuth.getState().loaded).toBe(true);
  });

  it("keeps the guest account and shows the error when loading fails", async () => {
    bridge.googleAccountGet.mockRejectedValue(new Error("boom"));
    await useAuth.getState().load();
    expect(useAuth.getState().account.mode).toBe("guest");
    expect(messages()).toEqual(["boom"]);
  });

  it("signs in and stores the returned account", async () => {
    const pending = deferred<GoogleAccount>();
    bridge.googleSignIn.mockReturnValue(pending.promise);
    const sign = useAuth.getState().signIn();
    expect(useAuth.getState().signingIn).toBe(true);
    pending.resolve(SIGNED_IN);
    await sign;
    expect(useAuth.getState().account).toEqual(SIGNED_IN);
    expect(useAuth.getState().signingIn).toBe(false);
  });

  it("reuses the running sign-in instead of starting a second browser flow", async () => {
    const pending = deferred<GoogleAccount>();
    bridge.googleSignIn.mockReturnValue(pending.promise);
    const first = useAuth.getState().signIn();
    const second = useAuth.getState().signIn();
    expect(second).toBe(first);
    expect(bridge.googleSignIn).toHaveBeenCalledTimes(1);
    pending.resolve(SIGNED_IN);
    await first;
  });

  it("shows the native error when sign-in fails", async () => {
    bridge.googleSignIn.mockRejectedValue("Google sign-in timed out. Please try again.");
    await useAuth.getState().signIn();
    expect(useAuth.getState().account.mode).toBe("guest");
    expect(useAuth.getState().signingIn).toBe(false);
    expect(messages()).toEqual(["Google sign-in timed out. Please try again."]);
  });

  it("ends a cancelled sign-in quietly", async () => {
    const pending = deferred<GoogleAccount>();
    bridge.googleSignIn.mockReturnValue(pending.promise);
    bridge.googleSignInCancel.mockResolvedValue(true);
    const sign = useAuth.getState().signIn();
    await useAuth.getState().cancelSignIn();
    expect(useAuth.getState().signingIn).toBe(false);
    expect(bridge.googleSignInCancel).toHaveBeenCalledTimes(1);
    pending.reject("Sign-in cancelled.");
    await sign;
    expect(messages()).toEqual([]);
  });

  it("opens the sign-out confirmation and signs out on confirm", async () => {
    bridge.googleSignOut.mockResolvedValue(GUEST_ACCOUNT);
    useAuth.setState({ account: SIGNED_IN });
    useAuth.getState().requestSignOut();
    const dialog = useUI.getState().dialog;
    expect(dialog?.title).toBe("Sign out of Hushio?");
    expect(dialog?.confirmLabel).toBe("Sign out");
    dialog?.onConfirm("");
    await vi.waitFor(() => expect(useAuth.getState().account.mode).toBe("guest"));
    expect(messages()).toEqual(["Signed out. Sync is off."]);
  });

  it("warns when the session ends in the background", () => {
    useAuth.setState({ account: SIGNED_IN });
    useAuth.getState().apply(GUEST_ACCOUNT);
    expect(messages()).toEqual(["Your Google session ended. Sign in again to keep your library in sync."]);
  });

  it("does not warn when a guest signs in", () => {
    useAuth.getState().apply(SIGNED_IN);
    expect(messages()).toEqual([]);
    expect(useAuth.getState().account).toEqual(SIGNED_IN);
  });

  it("subscribes to account changes and stops on cleanup", async () => {
    const unlisten = vi.fn();
    bridge.listenGoogleAuthChanged.mockResolvedValue(unlisten);
    bridge.googleAccountGet.mockResolvedValue(GUEST_ACCOUNT);
    const stop = startGoogleAuth();
    await vi.waitFor(() => expect(bridge.listenGoogleAuthChanged).toHaveBeenCalledTimes(1));
    stop();
    await vi.waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
  });
});
