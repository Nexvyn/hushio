import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { audio, playStream, seekTo, typeAhead, peekTypeAhead } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  seekTo: vi.fn(),
  typeAhead: vi.fn(),
  peekTypeAhead: vi.fn(),
}));

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  play: vi.fn(),
  pause: vi.fn(),
  seekTo,
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

vi.mock("../lib/search", () => ({ typeAhead, peekTypeAhead }));

import { TopBar } from "./TopBar";
import type { SearchSong, SuggestionRow } from "../lib/searchParse";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useRecents } from "../stores/recents";
import { useUI } from "../stores/ui";

const initialPlayer = usePlayer.getState();

function song(id: string, title: string): SearchSong {
  return {
    id,
    title,
    artist: "Dua Lipa",
    thumb: null,
    artistId: null,
    albumId: null,
    album: null,
    duration: 203,
    explicit: false,
    isVideo: false,
  };
}

const suggestions: SuggestionRow[] = [
  { kind: "completion", text: "dua lipa songs" },
  { kind: "track", track: song("lev", "Levitating") },
  { kind: "browse", item: { type: "artist", browseId: "UC1", title: "Dua Lipa", subtitle: "", thumb: null } },
];

function input(): HTMLElement {
  return screen.getByLabelText("Search");
}

describe("TopBar search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playStream.mockResolvedValue(undefined);
    typeAhead.mockResolvedValue(suggestions);
    peekTypeAhead.mockReturnValue(undefined);
    usePlayer.setState(initialPlayer, true);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "", searchFilter: "all" });
    useRecents.setState({ searches: [] });
    useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [] });
  });

  afterEach(cleanup);

  it("shows type-ahead suggestions after typing, requesting once per pause", async () => {
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(input());
    await user.type(input(), "dua");

    expect(await screen.findByRole("listbox", { name: "Search suggestions" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Levitating/ })).toBeTruthy();
    expect(typeAhead).toHaveBeenCalledTimes(1);
    expect(typeAhead).toHaveBeenCalledWith("dua");
  });

  it("exposes the highlighted option through the combobox", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    const listbox = await screen.findByRole("listbox");

    expect(input().getAttribute("role")).toBe("combobox");
    expect(input().getAttribute("aria-controls")).toBe(listbox.id);
    expect(input().getAttribute("aria-activedescendant")).toBeNull();

    await user.keyboard("{ArrowDown}{ArrowDown}");

    const active = screen.getByRole("option", { selected: true });
    expect(active.textContent).toContain("dua lipa songs");
    expect(input().getAttribute("aria-activedescendant")).toBe(active.id);
  });

  it("does not ask for suggestions for a single letter", async () => {
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(input());
    await user.type(input(), "d");

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(typeAhead).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("fills the field from a completion without searching", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    await screen.findByRole("listbox");

    await user.click(screen.getByLabelText('Fill in "dua lipa songs"'));

    expect(input()).toHaveProperty("value", "dua lipa songs");
    expect(useUI.getState().searchQuery).toBe("dua lipa songs");
    expect(useNavigation.getState().view.name).toBe("home");
  });

  it("submits the highlighted completion with the keyboard", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(useUI.getState().searchQuery).toBe("dua lipa songs");
    expect(useNavigation.getState().view.name).toBe("search");
    expect(useRecents.getState().searches).toEqual(["dua lipa songs"]);
  });

  it("plays the highlighted song with the keyboard", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");

    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["lev"]);
    expect(useRecents.getState().searches).toEqual(["dua"]);
  });

  it("opens the search page for the typed text when no suggestion is highlighted", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "ab{Enter}");

    expect(useUI.getState().searchQuery).toBe("ab");
    expect(useNavigation.getState().view.name).toBe("search");
    expect(useRecents.getState().searches).toEqual(["ab"]);
  });

  it("closes the suggestions on Escape", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    await screen.findByRole("listbox");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });
});
