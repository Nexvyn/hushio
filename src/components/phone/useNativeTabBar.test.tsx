import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

const bridge = vi.hoisted(() => ({
  playerTabBarSet: vi.fn((_state: unknown) => Promise.resolve()),
  listenNativeTabBar: vi.fn((_handlers: unknown) => Promise.resolve(() => {})),
}));
const haptics = vi.hoisted(() => ({ haptic: vi.fn() }));

vi.mock("../../lib/bridge", () => bridge);
vi.mock("../../lib/haptics", () => haptics);
vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { useNativeTabBar } from "./useNativeTabBar";
import { useNavigation } from "../../stores/navigation";
import { usePlayer } from "../../stores/player";
import { useUI } from "../../stores/ui";

type Press = { id: string; again: boolean };

type Handlers = { onPress: (press: Press) => void; onLongPress: () => void };

function handlers(): Handlers {
  return bridge.listenNativeTabBar.mock.calls[0][0] as Handlers;
}

function lastState(): { visible: boolean; rounded: boolean } | undefined {
  const calls = bridge.playerTabBarSet.mock.calls;
  return calls[calls.length - 1]?.[0] as { visible: boolean; rounded: boolean } | undefined;
}

const track = { id: "v1", title: "Night Drive", artist: "Band", thumb: null };

beforeEach(() => {
  document.documentElement.style.setProperty("--surface", "28 28 30");
  document.documentElement.style.setProperty("--ink-1", "245 245 247");
  document.documentElement.style.setProperty("--ink-2", "174 174 178");
  useNavigation.setState({ view: { name: "home" }, tab: "home", navPast: [], navFuture: [], pendingScroll: null });
  useUI.setState({ nowPlayingOpen: false, searchFocused: false, phoneQueueOpen: false });
  usePlayer.setState({ queue: [], index: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.getElementById("view-scroll")?.remove();
});

describe("useNativeTabBar", () => {
  it("sends the tab state, theme colours and labels on mount", () => {
    renderHook(() => useNativeTabBar({ enabled: true, active: "home" }));
    expect(bridge.playerTabBarSet).toHaveBeenCalledWith({
      active: "home",
      visible: true,
      rounded: true,
      surface: "#1c1c1e",
      ink1: "#f5f5f7",
      ink2: "#aeaeb2",
      labels: ["Home", "Search", "Library"],
    });
  });

  it("rounds the bar's top corners only when no mini player is shown", () => {
    renderHook(() => useNativeTabBar({ enabled: true, active: "home" }));
    expect(lastState()?.rounded).toBe(true);

    act(() => {
      usePlayer.setState({ queue: [track], index: 0 });
    });
    expect(lastState()?.rounded).toBe(false);

    act(() => {
      usePlayer.setState({ queue: [], index: 0 });
    });
    expect(lastState()?.rounded).toBe(true);
  });

  it("does nothing when disabled", () => {
    renderHook(() => useNativeTabBar({ enabled: false, active: "home" }));
    expect(bridge.playerTabBarSet).not.toHaveBeenCalled();
    expect(bridge.listenNativeTabBar).not.toHaveBeenCalled();
  });

  it("hides the bar while a sheet is open and shows it again after", () => {
    renderHook(() => useNativeTabBar({ enabled: true, active: "home" }));
    expect(lastState()?.visible).toBe(true);

    act(() => useUI.setState({ phoneQueueOpen: true }));
    expect(lastState()?.visible).toBe(false);

    act(() => useUI.setState({ phoneQueueOpen: false }));
    expect(lastState()?.visible).toBe(true);
  });

  it("navigates when a tab is pressed without a tick from JavaScript", () => {
    renderHook(() => useNativeTabBar({ enabled: true, active: "home" }));
    act(() => handlers().onPress({ id: "library", again: false }));
    expect(useNavigation.getState().view).toEqual({ name: "library" });
    expect(haptics.haptic).not.toHaveBeenCalled();
  });

  it("scrolls the view to the top when the active tab is pressed again", () => {
    const scroller = document.createElement("div");
    scroller.id = "view-scroll";
    const scrollTo = vi.fn();
    scroller.scrollTo = scrollTo;
    document.body.appendChild(scroller);

    renderHook(() => useNativeTabBar({ enabled: true, active: "home" }));
    act(() => handlers().onPress({ id: "home", again: true }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  });

  it("opens search on a long press and focuses the phone search field", () => {
    const field = document.createElement("input");
    field.id = "phone-search";
    document.body.appendChild(field);
    const focus = vi.spyOn(field, "focus");

    renderHook(() => useNativeTabBar({ enabled: true, active: "home" }));
    act(() => handlers().onLongPress());
    expect(useNavigation.getState().view).toEqual({ name: "search" });
    expect(focus).toHaveBeenCalled();
    expect(haptics.haptic).not.toHaveBeenCalled();
    field.remove();
  });
});
