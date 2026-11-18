import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";

const { haptic } = vi.hoisted(() => ({ haptic: vi.fn() }));

vi.mock("../lib/haptics", () => ({ haptic }));
vi.mock("../lib/usePhone", () => ({ usePhone: () => true }));
vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { FeedSectionView } from "./FeedSections";
import { LONG_HOLD_MS } from "../lib/phoneGestures";
import type { FeedSection, SectionItem } from "../lib/feed";
import { useUI } from "../stores/ui";

if (!("PointerEvent" in window)) {
  Object.defineProperty(window, "PointerEvent", { value: class extends MouseEvent {} });
}

function pointer(type: "pointerDown" | "pointerUp", target: Element, clientX: number, clientY: number) {
  fireEvent(target, createEvent[type](target, { clientX, clientY }));
}

const trackItem: SectionItem = {
  kind: "track",
  track: { id: "t1", title: "Shelf song", artist: "Shelf artist", thumb: null },
};

const section = {
  id: "s",
  kind: "because",
  title: "Made for you",
  layout: "row",
  priority: 1,
  items: [trackItem],
} as unknown as FeedSection;

beforeEach(() => {
  vi.useFakeTimers();
  useUI.setState({ contextMenu: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  haptic.mockClear();
});

describe("Home shelf track card long press", () => {
  it("opens the track menu", () => {
    render(<FeedSectionView section={section} />);
    const card = screen.getByRole("button", { name: /Shelf song/ });

    pointer("pointerDown", card, 30, 40);
    act(() => {
      vi.advanceTimersByTime(LONG_HOLD_MS);
    });
    pointer("pointerUp", card, 30, 40);
    fireEvent.click(card);

    const labels = useUI.getState().contextMenu?.items.map((item) => item.label) ?? [];
    expect(labels).toContain("Play next");
    expect(haptic).toHaveBeenCalledWith("select");
  });
});
