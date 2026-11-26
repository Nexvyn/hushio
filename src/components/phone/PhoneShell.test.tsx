import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Track } from "../../types";

const { audio, playStream, play, pause, seekTo, setVolume, setMuted, getPlaybackPosition } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(() => Promise.resolve()),
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  getPlaybackPosition: vi.fn(() => 0),
}));

vi.mock("../../lib/audio", () => ({ audio, playStream, play, pause, seekTo, setVolume, setMuted, getPlaybackPosition }));
vi.mock("../../lib/lyrics", () => ({ prefetchLyrics: () => {}, requestLyrics: () => Promise.resolve(null) }));
vi.mock("../../views/CurrentView", () => ({
  CurrentView: ({ view }: { view: { name: string } }) => <p>Screen {view.name}</p>,
}));
vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { PhoneShell } from "./PhoneShell";
import { glideSheet, sheetProgress, sheetY, travelPx } from "./sheetTravel";
import { useNavigation } from "../../stores/navigation";
import { usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";
import { useErase } from "../../stores/erase";
import { phoneBottomPad } from "../../lib/phoneNav";

const track = (i: number): Track => ({ id: `t${i}`, title: `Track ${i}`, artist: `Artist ${i}`, thumb: null });

if (!("PointerEvent" in window)) {
  Object.defineProperty(window, "PointerEvent", { configurable: true, value: class PointerEvent extends MouseEvent {} });
}

const scroller = () => document.getElementById("view-scroll") as HTMLElement;
const dock = () => screen.getByRole("navigation", { name: "Main" }).parentElement as HTMLElement;

beforeEach(() => {
  useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [], pendingScroll: null });
  usePlayer.setState({ queue: [], index: 0, playing: false, position: 0, duration: 0 });
  useUI.setState({ nowPlayingOpen: false });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.documentElement.classList.remove("reduce-motion");
});

describe("PhoneShell", () => {
  it("hides the tab bar and mini player while search is focused", () => {
    render(<PhoneShell />);
    const chrome = document.querySelector("[data-phone-chrome]") as HTMLElement;
    expect(chrome.getAttribute("aria-hidden")).toBeNull();

    act(() => useUI.setState({ searchFocused: true }));
    expect(chrome.getAttribute("aria-hidden")).toBe("true");

    act(() => useUI.setState({ searchFocused: false }));
    expect(chrome.getAttribute("aria-hidden")).toBeNull();
  });

  it("shows the current screen above the tab bar", () => {
    render(<PhoneShell />);
    expect(screen.getByText("Screen home")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
  });

  it("shows the erase dialog on the phone", () => {
    useErase.getState().open("reset");
    render(<PhoneShell />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    useErase.setState({ mode: null });
  });

  it("hides the mini player when nothing is loaded", () => {
    render(<PhoneShell />);
    expect(screen.queryByRole("region", { name: "Mini player" })).toBeNull();
  });

  it("shows the mini player once an item is loaded", () => {
    usePlayer.setState({ queue: [track(1)], index: 0 });
    render(<PhoneShell />);
    expect(screen.getByRole("region", { name: "Mini player" })).toBeTruthy();
  });

  it("reserves the mini player, tab bar and final scroll gap once", () => {
    usePlayer.setState({ queue: [track(1)], index: 0 });
    render(<PhoneShell />);
    expect(scroller().style.paddingBottom).toBe(phoneBottomPad(true));
  });

  it("changes the screen when a tab is tapped", async () => {
    render(<PhoneShell />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByText("Screen search")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Screen home")).toBeNull());
  });

  it("keeps the old screen mounted while it fades out", async () => {
    render(<PhoneShell />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByText("Screen home")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Screen home")).toBeNull());
  });

  it("removes the old screen at once under reduced motion", async () => {
    document.documentElement.classList.add("reduce-motion");
    render(<PhoneShell />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.queryByText("Screen home")).toBeNull());
  });

  it("scrolls the view to the top when the status strip is tapped", () => {
    render(<PhoneShell />);
    const scroller = document.getElementById("view-scroll") as HTMLElement;
    const scrollTo = vi.fn();
    Object.assign(scroller, { scrollTo });
    fireEvent.click(document.querySelector("[data-status-strip]") as HTMLElement);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("jumps to the top without smooth scrolling under reduced motion", () => {
    document.documentElement.classList.add("reduce-motion");
    render(<PhoneShell />);
    const scroller = document.getElementById("view-scroll") as HTMLElement;
    const scrollTo = vi.fn();
    Object.assign(scroller, { scrollTo });
    fireEvent.click(document.querySelector("[data-status-strip]") as HTMLElement);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("uses theme tokens for the dock and no hard-coded dark or white fill", () => {
    usePlayer.setState({ queue: [track(1)], index: 0 });
    render(<PhoneShell />);
    expect(dock().className).toContain("bg-surface");
    expect(dock().className).not.toContain("border-separator");
    expect(dock().className).not.toMatch(/#191d25|bg-white/);
  });

  it("keeps the dock and mini player visible after scrolling down", () => {
    usePlayer.setState({ queue: [track(1)], index: 0 });
    render(<PhoneShell />);
    Object.defineProperty(scroller(), "scrollTop", { configurable: true, get: () => 400 });
    fireEvent.scroll(scroller());
    expect(["", "none"]).toContain(dock().style.transform);
    expect(screen.getByRole("navigation", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Mini player" })).toBeTruthy();
  });

  it("does not open Now Playing for a swipe up that starts on the page content", () => {
    usePlayer.setState({ queue: [track(1)], index: 0 });
    render(<PhoneShell />);
    const content = screen.getByText("Screen home");
    fireEvent.pointerDown(content, { clientX: 120, clientY: 600 });
    fireEvent.pointerMove(content, { clientX: 120, clientY: 300 });
    fireEvent.pointerUp(content, { clientX: 120, clientY: 300 });
    expect(useUI.getState().nowPlayingOpen).toBe(false);
  });

  it("is not left scaled or dimmed when a close is interrupted by the screen turning off", async () => {
    usePlayer.setState({ queue: [track(1)], index: 0 });
    useUI.setState({ nowPlayingOpen: true });
    render(<PhoneShell />);
    act(() => {
      sheetY.set(travelPx() * 0.4);
      expect(sheetProgress.get()).toBeCloseTo(0.6);
      glideSheet(travelPx(), 0, () => useUI.getState().closeNowPlaying());
    });
    const page = document.querySelector<HTMLElement>("[data-phone-page]") as HTMLElement;
    await waitFor(() => expect(page.style.transform).toContain("scale"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    expect(useUI.getState().nowPlayingOpen).toBe(false);
    expect(sheetY.get()).toBe(travelPx());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Now playing" })).toBeNull(), { timeout: 3000 });
    expect(["", "none"]).toContain(page.style.transform);
    expect(document.querySelector("[data-page-shade]")).toBeNull();
    expect(dock().isConnected && page.contains(dock())).toBe(true);
  });
});
