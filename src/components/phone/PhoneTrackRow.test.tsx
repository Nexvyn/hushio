import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const phone = vi.hoisted(() => ({ value: true }));

vi.mock("../../lib/usePhone", () => ({ usePhone: () => phone.value }));
vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { PhoneSongRow } from "./PhoneTrackRow";
import type { SearchSong } from "../../lib/searchParse";
import { useLibrary } from "../../stores/library";

const song: SearchSong = {
  id: "s1",
  title: "Physical",
  artist: "Dua Lipa",
  thumb: null,
  artistId: null,
  albumId: null,
  album: null,
  duration: 203,
  explicit: false,
  isVideo: false,
};

function renderRow(current: boolean, playing: boolean) {
  return render(
    <ol>
      <PhoneSongRow
        index={0}
        song={song}
        current={current}
        playing={playing}
        menu={() => []}
        onPlay={() => {}}
      />
    </ol>,
  );
}

describe("PhoneSongRow playing state", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("reduce-motion");
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("reduce-motion");
  });

  it("sets the playing title in the accent colour at weight 500", () => {
    renderRow(true, true);

    const title = screen.getByText("Physical");
    expect(title.parentElement?.className).toContain("text-accent");
    expect(title.parentElement?.className).toContain("font-medium");
  });

  it("animates the equaliser only while the song plays", () => {
    const { container } = renderRow(true, true);
    expect(container.querySelectorAll(".bt-eq").length).toBe(3);
    cleanup();

    const paused = renderRow(true, false);
    expect(paused.container.querySelectorAll(".bt-eq").length).toBe(0);
  });

  it("keeps the equaliser still under Reduce Motion", () => {
    document.documentElement.classList.add("reduce-motion");
    const { container } = renderRow(true, true);

    expect(container.querySelectorAll(".bt-eq").length).toBe(0);
  });

  it("shows no accent on rows that are not playing", () => {
    renderRow(false, true);

    expect(screen.getByText("Physical").parentElement?.className).not.toContain("text-accent");
  });
});

describe("PhoneSongRow like state", () => {
  afterEach(() => {
    cleanup();
    useLibrary.setState({ liked: [] });
  });

  it("shows a heart on a liked song", () => {
    useLibrary.setState({ liked: [{ ...song, album: null, duration: 203, explicit: false }] });
    renderRow(false, false);
    expect(screen.getByRole("img", { name: "Liked" })).toBeTruthy();
  });

  it("shows no heart on a song that is not liked", () => {
    renderRow(false, false);
    expect(screen.queryByRole("img", { name: "Liked" })).toBeNull();
  });
});
