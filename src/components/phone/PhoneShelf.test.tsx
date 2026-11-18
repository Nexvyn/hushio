import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";

const { haptic, openRecentItem } = vi.hoisted(() => ({ haptic: vi.fn(), openRecentItem: vi.fn() }));

vi.mock("../../lib/haptics", () => ({ haptic }));
vi.mock("../../lib/searchActions", () => ({ openRecentItem }));

import { PhoneQuickTiles, PhoneShelfCard } from "./PhoneShelf";
import { LONG_HOLD_MS } from "../../lib/phoneGestures";
import { useUI } from "../../stores/ui";
import type { RecentItem } from "../../stores/recents";

if (!("PointerEvent" in window)) {
  Object.defineProperty(window, "PointerEvent", { value: class extends MouseEvent {} });
}

function pointer(type: "pointerDown" | "pointerMove" | "pointerUp", target: Element, clientX: number, clientY: number) {
  fireEvent(target, createEvent[type](target, { clientX, clientY }));
}

const menu = () => [{ label: "Play next", onSelect: () => {} }];
const recent: RecentItem = { kind: "album", id: "a1", title: "Recent album", subtitle: "Artist", thumb: null } as RecentItem;

beforeEach(() => {
  vi.useFakeTimers();
  useUI.setState({ contextMenu: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  haptic.mockClear();
  openRecentItem.mockClear();
});

describe("PhoneShelfCard long press", () => {
  it("opens the item menu with a select tick, and the click after the hold does not activate", () => {
    const onActivate = vi.fn();
    render(<PhoneShelfCard title="Card" art={<span />} variant="tile" menu={menu} onActivate={onActivate} />);
    const card = screen.getByRole("button", { name: /Card/ });

    pointer("pointerDown", card, 30, 40);
    act(() => {
      vi.advanceTimersByTime(LONG_HOLD_MS);
    });
    pointer("pointerUp", card, 30, 40);
    fireEvent.click(card);

    expect(useUI.getState().contextMenu?.items.map((item) => item.label)).toEqual(["Play next"]);
    expect(useUI.getState().contextMenu?.x).toBe(30);
    expect(haptic).toHaveBeenCalledWith("select");
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("a short tap still activates and does not open the menu", () => {
    const onActivate = vi.fn();
    render(<PhoneShelfCard title="Card" art={<span />} variant="tile" menu={menu} onActivate={onActivate} />);
    const card = screen.getByRole("button", { name: /Card/ });

    pointer("pointerDown", card, 30, 40);
    pointer("pointerUp", card, 30, 40);
    fireEvent.click(card);

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(useUI.getState().contextMenu).toBeNull();
  });

  it("a horizontal drag cancels the hold so the shelf can scroll", () => {
    render(<PhoneShelfCard title="Card" art={<span />} variant="tile" menu={menu} onActivate={() => {}} />);
    const card = screen.getByRole("button", { name: /Card/ });

    pointer("pointerDown", card, 0, 0);
    pointer("pointerMove", card, 40, 0);
    act(() => {
      vi.advanceTimersByTime(LONG_HOLD_MS);
    });

    expect(useUI.getState().contextMenu).toBeNull();
    expect(haptic).not.toHaveBeenCalled();
  });
});

describe("PhoneQuickTiles long press", () => {
  it("opens the menu for a tile that has one", () => {
    render(<PhoneQuickTiles items={[recent]} menuFor={() => menu} />);
    const tile = screen.getByRole("button", { name: /Recent album/ });

    pointer("pointerDown", tile, 5, 5);
    act(() => {
      vi.advanceTimersByTime(LONG_HOLD_MS);
    });
    pointer("pointerUp", tile, 5, 5);
    fireEvent.click(tile);

    expect(useUI.getState().contextMenu?.items.map((item) => item.label)).toEqual(["Play next"]);
    expect(openRecentItem).not.toHaveBeenCalled();
  });
});
