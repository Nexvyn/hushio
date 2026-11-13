import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackRow } from "./TrackRow";
import type { SearchSong } from "../lib/searchParse";

vi.mock("../lib/bridge", () => ({
  persistWrite: vi.fn(),
  persistRead: vi.fn(async () => null),
}));

const song: SearchSong = {
  id: "v1",
  title: "Kesariya",
  artist: "ARIJEET SINGH,NEETI MOHAN",
  thumb: null,
  artistId: null,
  albumId: null,
  album: "Brahmastra",
  duration: 245,
  explicit: false,
  isVideo: false,
};

function renderRow(overrides: Partial<Parameters<typeof TrackRow>[0]> = {}) {
  return render(
    <ol>
      <TrackRow index={0} song={song} current={false} playing={false} menu={() => []} onPlay={() => {}} {...overrides} />
    </ol>,
  );
}

describe("TrackRow", () => {
  afterEach(cleanup);

  it("uses the 56px row and normalised artist credits with tabular duration", () => {
    const { container } = renderRow();
    expect(container.querySelector("li")?.className).toContain("h-14");
    expect(screen.getByText("Arijeet Singh, Neeti Mohan")).toBeTruthy();
    expect(screen.getByText("4:05").className).toContain("tabular-nums");
  });

  it("marks the playing row with the accent title", () => {
    renderRow({ current: true, playing: true });
    expect(screen.getAllByText("Kesariya")[0].closest("span[class*='font-medium']")?.className).toContain("text-accent");
  });

  it("keeps row actions hidden until hover or focus, and always shown on touch", () => {
    const { container } = renderRow();
    const actions = container.querySelector('[data-no-drag]');
    expect(actions?.className).toContain("opacity-0");
    expect(actions?.className).toContain("group-focus-within:opacity-100");
    expect(actions?.className).toContain("[@media(hover:none)]:opacity-100");
  });

  it("hides the artist line when the credit is unknown", () => {
    renderRow({ song: { ...song, artist: "" } });
    expect(screen.getAllByText("Kesariya").length).toBeGreaterThan(0);
    expect(screen.queryByText("Arijeet Singh, Neeti Mohan")).toBeNull();
  });
});
