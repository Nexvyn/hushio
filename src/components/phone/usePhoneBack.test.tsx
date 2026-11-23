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
import { useSongInfo } from "../../stores/songInfo";
import { usePlaylistEdit } from "../../stores/playlistEdit";

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
  useUI.setState({ contextMenu: null, dialog: null, playlistPicker: null, phoneQueueOpen: false, phoneLyricsOpen: false, nowPlayingOpen: false, toasts: [], pendingToasts: [] });
  useSongInfo.setState({ song: null });
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

  it("closes song info on back and does not go back in history", async () => {
    renderHook(() => usePhoneBack());
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    useNavigation.setState({ view: { name: "search" }, navPast: [{ view: { name: "home" }, scroll: 0 }] });
    useSongInfo.setState({
      song: { id: "s1", title: "Song", artist: "Artist", thumb: null, artistId: null, albumId: null, album: null, duration: 0, explicit: false, isVideo: false },
    });
    press();
    expect(useSongInfo.getState().song).toBeNull();
    expect(useNavigation.getState().view.name).toBe("search");
    expect(useNavigation.getState().navPast).toHaveLength(1);
  });

  it("closes the playlist edit sheet on back before going back in history", async () => {
    renderHook(() => usePhoneBack());
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    useNavigation.setState({ view: { name: "library" }, navPast: [{ view: { name: "home" }, scroll: 0 }] });
    usePlaylistEdit.getState().open("pl-1");
    press();
    expect(usePlaylistEdit.getState().id).toBeNull();
    expect(useNavigation.getState().view.name).toBe("library");
    expect(useNavigation.getState().navPast).toHaveLength(1);
  });

  it("closes the lyrics panel on back and keeps Now Playing open", async () => {
    renderHook(() => usePhoneBack());
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    useUI.setState({ nowPlayingOpen: true, phoneLyricsOpen: true });
    press();
    expect(useUI.getState().phoneLyricsOpen).toBe(false);
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
