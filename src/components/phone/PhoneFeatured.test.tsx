import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { startPlaySource, navigate } = vi.hoisted(() => ({
  startPlaySource: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("../../lib/playSource", () => ({ startPlaySource }));

vi.mock("../../stores/navigation", () => ({
  useNavigation: (selector: (state: { navigate: typeof navigate }) => unknown) => selector({ navigate }),
}));

import { PhoneFeatured, type FeaturedItem } from "./PhoneFeatured";

const album: FeaturedItem = {
  label: "Albums for you",
  title: "Shelf album",
  subtitle: "Album artist",
  thumb: null,
  source: { type: "album", albumId: "MPREalbum", name: "Shelf album" },
  target: { name: "album", param: "MPREalbum" },
};

describe("PhoneFeatured", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("falls back to the elevated surface when there is no cover colour", () => {
    render(<PhoneFeatured item={album} />);

    const card = screen.getByRole("button", { name: "Play Shelf album" }).parentElement;
    expect(card?.className).toContain("h-[132px]");
    expect(card?.className).toContain("rounded-[12px]");
    expect(card?.className).toContain("bg-elevated");
    expect(card?.querySelector("[data-ambient-backdrop]")).toBeNull();
  });

  it("plays the item from the round play button", () => {
    render(<PhoneFeatured item={album} />);

    fireEvent.click(screen.getByRole("button", { name: "Play Shelf album" }));

    expect(startPlaySource).toHaveBeenCalledWith(album.source);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens the item from the rest of the card", () => {
    render(<PhoneFeatured item={album} />);

    fireEvent.click(screen.getByRole("button", { name: /Albums for you/ }));

    expect(navigate).toHaveBeenCalledWith(album.target);
    expect(startPlaySource).not.toHaveBeenCalled();
  });
});
