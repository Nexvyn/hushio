import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { haptic } = vi.hoisted(() => ({ haptic: vi.fn() }));

vi.mock("../../lib/haptics", () => ({ haptic }));

vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { PhoneQueueList } from "./PhoneQueueSheet";
import { PHONE_ROW_DP } from "./PhoneTrackRow";
import { queueEntryKeys } from "../../lib/queueKeys";
import { usePlayer } from "../../stores/player";
import { useSettings } from "../../stores/settings";
import type { Track } from "../../types";

const first: Track = { id: "q1", title: "First", artist: "Band", thumb: null };
const second: Track = { id: "q2", title: "Second", artist: "Band", thumb: null };
const third: Track = { id: "q3", title: "Third", artist: "Band", thumb: null };

if (!("PointerEvent" in window)) {
  Object.defineProperty(window, "PointerEvent", { value: class extends MouseEvent {} });
}

function pointer(type: "pointerDown" | "pointerMove" | "pointerUp", target: Element, clientY: number) {
  fireEvent(target, createEvent[type](target, { clientX: 0, clientY }));
}

beforeEach(() => {
  usePlayer.setState({ queue: [first, second], index: 0, playing: false, buffering: false, position: 0, duration: 200 });
});

afterEach(() => {
  cleanup();
  haptic.mockClear();
});

describe("PhoneQueueList rows", () => {
  it("does not repeat the current song as a row under the sheet header", () => {
    render(<PhoneQueueList />);

    expect(screen.queryByRole("heading", { name: "Now playing" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Play First" })).toBeNull();
    expect(screen.queryByText("First")).toBeNull();
    expect(screen.getByRole("heading", { name: "Up next" })).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });

  it("keeps the row content transparent so the tinted page shows through", () => {
    const { container } = render(<PhoneQueueList />);
    const content = container.querySelector("[data-swipe-row] > div");
    expect(content?.className).not.toContain("bg-base");
    expect(container.querySelector('[role="group"][aria-label="Playback modes"]')?.className).not.toContain("bg-wash");
  });

  it("shows a drag handle on each up next row beside its menu button", () => {
    render(<PhoneQueueList />);
    const handle = screen.getByRole("button", { name: "Drag Second to reorder" });
    expect(handle.className).toContain("touch-none");
    expect(screen.getByRole("button", { name: "More options for Second" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Drag First to reorder" })).toBeNull();
  });

  it("drags an up next row by its handle and drops it at the new slot", async () => {
    usePlayer.setState({ queue: [first, second, third], index: 0 });
    render(<PhoneQueueList />);
    const handle = screen.getByRole("button", { name: "Drag Third to reorder" });

    pointer("pointerDown", handle, 200);
    pointer("pointerMove", handle, 140);
    pointer("pointerUp", handle, 140);

    await waitFor(() => expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["q1", "q3", "q2"]));
    expect(haptic).toHaveBeenCalledWith("tick");
  });

  it("leaves the queue alone when the handle is released in place", () => {
    usePlayer.setState({ queue: [first, second, third], index: 0 });
    render(<PhoneQueueList />);
    const handle = screen.getByRole("button", { name: "Drag Second to reorder" });

    pointer("pointerDown", handle, 200);
    pointer("pointerUp", handle, 200);

    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["q1", "q2", "q3"]);
  });
});

describe("PhoneQueueList sections and modes", () => {
  const fourth: Track = { id: "q4", title: "Fourth", artist: "Band", thumb: null };

  beforeEach(() => {
    usePlayer.setState({ queue: [first, second, third, fourth], index: 2, autoplayCount: 0, playingFrom: null, shuffle: false, repeat: "off" });
    useSettings.setState({ autoplay: true });
  });

  it("hides previously played tracks until the user asks for them", () => {
    render(<PhoneQueueList />);
    expect(screen.queryByText("First")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show previously played" }));
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide previously played" }));
    expect(screen.queryByText("First")).toBeNull();
  });

  it("hides the previously played toggle on the first track", () => {
    usePlayer.setState({ index: 0 });
    render(<PhoneQueueList />);
    expect(screen.queryByRole("button", { name: "Show previously played" })).toBeNull();
  });

  it("shows where playback started under now playing", () => {
    usePlayer.setState({ playingFrom: "__liked__" });
    render(<PhoneQueueList />);
    expect(screen.getByText("Playing from Liked Songs")).toBeTruthy();
  });

  it("puts the autoplay tail under its own heading with one explanation line", () => {
    usePlayer.setState({ index: 0, autoplayCount: 2 });
    render(<PhoneQueueList />);
    expect(screen.getByRole("button", { name: "Drag Second to reorder" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Drag Third to reorder" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Autoplay" })).toBeTruthy();
    expect(screen.getByText("Similar songs play after your queue ends.")).toBeTruthy();
    expect(screen.getByText("Third")).toBeTruthy();
    expect(screen.getByText("Fourth")).toBeTruthy();
  });

  it("shows no autoplay heading when the queue has no autoplay tail", () => {
    render(<PhoneQueueList />);
    expect(screen.queryByRole("heading", { name: "Autoplay" })).toBeNull();
  });

  it("does not let an upnext row drop into the autoplay tail", () => {
    usePlayer.setState({ queue: [first, second, third, fourth], index: 0, autoplayCount: 2 });
    render(<PhoneQueueList />);
    const handle = screen.getByRole("button", { name: "Drag Second to reorder" });
    pointer("pointerDown", handle, 200);
    pointer("pointerMove", handle, 400);
    pointer("pointerUp", handle, 400);
    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["q1", "q2", "q3", "q4"]);
  });

  it("toggles shuffle from the header row with a tick", () => {
    render(<PhoneQueueList />);
    fireEvent.click(screen.getByRole("button", { name: "Enable shuffle" }));
    expect(usePlayer.getState().shuffle).toBe(true);
    expect(screen.getByRole("button", { name: "Disable shuffle" }).getAttribute("aria-pressed")).toBe("true");
    expect(haptic).toHaveBeenCalledWith("tick");
  });

  it("cycles repeat off, all, one", () => {
    render(<PhoneQueueList />);
    fireEvent.click(screen.getByRole("button", { name: "Enable repeat" }));
    expect(usePlayer.getState().repeat).toBe("all");
    fireEvent.click(screen.getByRole("button", { name: "Disable repeat" }));
    expect(usePlayer.getState().repeat).toBe("one");
  });

  it("turns the autoplay setting off and on", () => {
    render(<PhoneQueueList />);
    fireEvent.click(screen.getByRole("button", { name: "Disable autoplay" }));
    expect(useSettings.getState().autoplay).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Enable autoplay" }));
    expect(useSettings.getState().autoplay).toBe(true);
  });
});

describe("PhoneQueueList removal motion", () => {
  type Call = { text: string; frames: Keyframe[] };
  let calls: Call[] = [];
  const originalOffsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");

  beforeEach(() => {
    calls = [];
    usePlayer.setState({ queue: [first, second, third], index: 0 });
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get(this: HTMLElement) {
        const parent = this.parentElement;
        return parent ? Array.from(parent.children).indexOf(this) * PHONE_ROW_DP : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      writable: true,
      value(this: HTMLElement, frames: Keyframe[]) {
        calls.push({ text: this.textContent ?? "", frames });
        return { cancel() {}, finished: Promise.resolve() } as unknown as Animation;
      },
    });
  });

  afterEach(() => {
    document.documentElement.classList.remove("reduce-motion");
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    if (originalOffsetTop) Object.defineProperty(HTMLElement.prototype, "offsetTop", originalOffsetTop);
  });

  it("fades the removed up next row out and slides the rows below it up", () => {
    render(<PhoneQueueList />);
    calls = [];
    act(() => usePlayer.getState().removeAt(1));
    const removed = calls.find((call) => call.text.includes("Second"));
    expect(removed?.frames).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    const moved = calls.find((call) => call.text.includes("Third"));
    expect(moved?.frames[0]).toEqual({ transform: `translateY(${PHONE_ROW_DP}px)` });
  });

  it("skips the removal motion under Reduce Motion", () => {
    document.documentElement.classList.add("reduce-motion");
    render(<PhoneQueueList />);
    calls = [];
    act(() => usePlayer.getState().removeAt(1));
    expect(calls).toEqual([]);
  });

  it("keys each up next row by its queue entry", () => {
    const { container } = render(<PhoneQueueList />);
    const keys = queueEntryKeys([first, second, third]);
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-row-key]")).map((row) => row.dataset.rowKey);
    expect(rows).toEqual([keys[1], keys[2]]);
  });
});
