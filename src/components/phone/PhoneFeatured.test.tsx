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

  it("renders a flat row with a 112 px cover and an unfilled play control", () => {
    render(<PhoneFeatured item={album} />);

    const row = screen.getByRole("button", { name: "Play Shelf album" }).parentElement;
    expect(row?.className).not.toContain("bg-elevated");
    expect(row?.className).not.toContain("h-[132px]");
    expect(screen.getByRole("button", { name: "Play Shelf album" }).className).toContain("border-ink-2");
    expect(screen.queryByText("Albums for you")).toBeNull();
    expect(screen.getByText("Shelf album").className).toContain("text-phone-row-title");
  });

  it("plays the item from the round play button", () => {
    render(<PhoneFeatured item={album} />);

    fireEvent.click(screen.getByRole("button", { name: "Play Shelf album" }));

    expect(startPlaySource).toHaveBeenCalledWith(album.source);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens the item from the rest of the card", () => {
    render(<PhoneFeatured item={album} />);

    fireEvent.click(screen.getByRole("button", { name: /^Shelf album/ }));

    expect(navigate).toHaveBeenCalledWith(album.target);
    expect(startPlaySource).not.toHaveBeenCalled();
  });
});
