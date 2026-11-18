import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrackRow } from "./TrackRow";
import type { SearchSong } from "../lib/searchParse";

vi.mock("../lib/bridge", () => ({
  platform: "windows",
  persistWrite: vi.fn(),
  persistRead: vi.fn(async () => null),
}));

const song: SearchSong = {
  id: "v1",
  title: "Kesariya",
  artist: "Arijeet Singh",
  thumb: null,
  artistId: null,
  albumId: null,
  album: null,
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

afterEach(cleanup);

describe("TrackRow selection", () => {
  it("selects on click and plays on double click or Enter", () => {
    const onPlay = vi.fn();
    const onSelectClick = vi.fn();
    renderRow({ onPlay, onSelectClick });
    const title = screen.getByText("Kesariya");

    fireEvent.click(title);
    expect(onSelectClick).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();

    fireEvent.doubleClick(title);
    expect(onPlay).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByText("Kesariya").closest("button") as HTMLElement, { key: "Enter" });
    expect(onPlay).toHaveBeenCalledTimes(2);
  });

  it("still plays on click for lists without selection", () => {
    const onPlay = vi.fn();
    renderRow({ onPlay });
    fireEvent.click(screen.getByText("Kesariya"));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it("shows the selected token on a selected row", () => {
    renderRow({ selected: true, onSelectClick: () => {} });
    expect(screen.getByText("Kesariya").closest("li")?.className).toContain("bg-selected");
  });

  it("shows when the song was added in the Date added column", () => {
    renderRow({ showAdded: true, addedAt: Date.now() - 3 * 24 * 60 * 60 * 1000 });
    expect(screen.getByText("3 days ago")).toBeTruthy();
  });
});
