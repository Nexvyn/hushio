import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";

const { listen, exitApp, persistRead, persistWrite } = vi.hoisted(() => ({
  listen: vi.fn(),
  exitApp: vi.fn(() => Promise.resolve()),
  persistRead: vi.fn(() => Promise.resolve(null)),
  persistWrite: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../lib/bridge", () => ({
  listenBackButton: listen,
  exitApp,
  persistRead,
  persistWrite,
}));

import { usePhoneBack } from "./usePhoneBack";
import { useNavigation } from "../../stores/navigation";
import { useUI } from "../../stores/ui";

let press: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  press = () => {};
  listen.mockImplementation((onPress: () => void) => {
    press = onPress;
    return Promise.resolve(() => {});
  });
  exitApp.mockClear();
  useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [], pendingScroll: null });
  useUI.setState({ contextMenu: null, dialog: null, playlistPicker: null, phoneQueueOpen: false, phoneLyricsSearchOpen: false, nowPlayingOpen: false, toasts: [], pendingToasts: [] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePhoneBack", () => {
  it("closes the open menu sheet before anything else", async () => {
    renderHook(() => usePhoneBack());
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    useUI.setState({ contextMenu: { items: [], x: 0, y: 0 }, nowPlayingOpen: true });
    press();
    expect(useUI.getState().contextMenu).toBeNull();
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("closes the phone lyrics search sheet on back", async () => {
    renderHook(() => usePhoneBack());
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    useUI.setState({ nowPlayingOpen: true, phoneLyricsSearchOpen: true });
    press();
    expect(useUI.getState().phoneLyricsSearchOpen).toBe(false);
    expect(useUI.getState().nowPlayingOpen).toBe(true);
  });

  it("closes Now Playing, then goes back in history", async () => {
    renderHook(() => usePhoneBack());
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    useUI.setState({ nowPlayingOpen: true });
    useNavigation.setState({ view: { name: "search" }, navPast: [{ view: { name: "home" }, scroll: 0 }] });
    press();
    expect(useUI.getState().nowPlayingOpen).toBe(false);
    press();
    expect(useNavigation.getState().view.name).toBe("home");
  });

  it("exits only on a second back within 2 s at Home", async () => {
    renderHook(() => usePhoneBack());
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    press();
    expect(exitApp).not.toHaveBeenCalled();
    expect(useUI.getState().toasts).toHaveLength(1);
    vi.setSystemTime(1_000_000 + 1_500);
    press();
    expect(exitApp).toHaveBeenCalledTimes(1);
  });

  it("re-arms when the second back comes too late", async () => {
    renderHook(() => usePhoneBack());
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    press();
    vi.setSystemTime(1_000_000 + 2_500);
    press();
    expect(exitApp).not.toHaveBeenCalled();
  });
});
