import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { PlaylistPicker } from "./PlaylistPicker";
import { type LibraryTrack, type Playlist, useLibrary } from "../stores/library";
import { useUI } from "../stores/ui";
import type { Track } from "../types";

const song = (id: string): Track => ({ id, title: `Song ${id}`, artist: "Band", thumb: null });
const libraryTrack = (id: string): LibraryTrack => ({ ...song(id), album: null, duration: 0, explicit: false });
const playlist = (id: string, name: string, ids: string[] = []): Playlist => ({
  id,
  name,
  folderId: null,
  pinned: false,
  tracks: ids.map(libraryTrack),
});

const initialLibrary = useLibrary.getState();
const initialUI = useUI.getState();

function openWith(tracks: Track[], playlists: Playlist[]) {
  useLibrary.setState({ playlists });
  act(() => useUI.getState().openPlaylistPicker(tracks));
  return render(<PlaylistPicker />);
}

function trackIds(id: string): string[] {
  return useLibrary.getState().playlists.find((item) => item.id === id)?.tracks.map((item) => item.id) ?? [];
}

beforeEach(() => {
  useLibrary.setState({ ...initialLibrary, playlists: [] }, true);
  useUI.setState({ ...initialUI, playlistPicker: null, toasts: [] }, true);
});

afterEach(cleanup);

describe("Add to playlists picker", () => {
  it("stays closed until tracks are opened, and never opens for an empty selection", () => {
    const { container } = render(<PlaylistPicker />);
    expect(container.innerHTML).toBe("");

    act(() => useUI.getState().openPlaylistPicker([]));
    expect(useUI.getState().playlistPicker).toBeNull();
  });

  it("names a single song in quotes and counts several", () => {
    const { unmount } = openWith([song("s1")], [playlist("a", "Mix")]);
    expect(screen.getByText('Choose where "Song s1" should go.')).toBeTruthy();
    unmount();

    openWith([song("s1"), song("s2")], [playlist("a", "Mix")]);
    expect(screen.getByText("Choose where 2 songs should go.")).toBeTruthy();
  });

  it("tells the listener when there are no playlists", () => {
    openWith([song("s1")], []);
    expect(screen.getByText("You don't have any playlists yet.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps Add disabled until a playlist is ticked, and unticking clears it again", () => {
    openWith([song("s1")], [playlist("a", "Mix")]);
    const add = screen.getByRole("button", { name: "Add" }) as HTMLButtonElement;
    const mix = screen.getByRole("checkbox", { name: /Mix/ });

    expect(add.disabled).toBe(true);
    fireEvent.click(mix);
    expect(mix.getAttribute("aria-checked")).toBe("true");
    expect(add.disabled).toBe(false);
    fireEvent.click(mix);
    expect(add.disabled).toBe(true);
  });

  it("locks playlists that already hold every selected song and never adds to them twice", () => {
    openWith([song("s1")], [playlist("a", "Mix", ["s1"]), playlist("b", "Road")]);
    const mix = screen.getByRole("checkbox", { name: /Mix/ }) as HTMLButtonElement;

    expect(mix.disabled).toBe(true);
    expect(mix.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Already added")).toBeTruthy();

    fireEvent.click(mix);
    expect(mix.getAttribute("aria-checked")).toBe("true");
    expect(trackIds("a")).toEqual(["s1"]);
  });

  it("adds every song to all ticked playlists in one action and confirms with a toast", () => {
    openWith(
      [song("s1"), song("s2")],
      [playlist("a", "Mix"), playlist("b", "Road"), playlist("c", "Full", ["s1", "s2"])],
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Mix/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Road/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(trackIds("a")).toEqual(["s1", "s2"]);
    expect(trackIds("b")).toEqual(["s1", "s2"]);
    expect(trackIds("c")).toEqual(["s1", "s2"]);
    expect(useUI.getState().toasts.map((toast) => toast.message)).toEqual(["Added to 2 playlists"]);
    expect(useUI.getState().playlistPicker).toBeNull();
  });

  it("confirms a single playlist with the singular toast", () => {
    openWith([song("s1")], [playlist("a", "Mix")]);

    fireEvent.click(screen.getByRole("checkbox", { name: /Mix/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(useUI.getState().toasts.map((toast) => toast.message)).toEqual(["Added to 1 playlist"]);
  });

  it("closes on Escape without adding anything", () => {
    openWith([song("s1")], [playlist("a", "Mix")]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Mix/ }));

    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(useUI.getState().playlistPicker).toBeNull();
    expect(trackIds("a")).toEqual([]);
  });

  it("closes when the backdrop is pressed", () => {
    const { container } = openWith([song("s1")], [playlist("a", "Mix")]);
    const backdrop = container.querySelector<HTMLElement>('[aria-hidden="true"]') as HTMLElement;

    fireEvent.mouseDown(backdrop);

    expect(useUI.getState().playlistPicker).toBeNull();
  });

  it("focuses the first enabled playlist when it opens", async () => {
    openWith([song("s1")], [playlist("a", "Mix", ["s1"]), playlist("b", "Road")]);

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: /Road/ })));
  });

  it("keeps Tab and Shift+Tab inside the dialog", async () => {
    openWith([song("s1")], [playlist("a", "Mix"), playlist("b", "Road")]);
    const first = screen.getByRole("checkbox", { name: /Mix/ });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(first));

    cancel.focus();
    fireEvent.keyDown(cancel, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancel);
  });

  it("returns focus to the control that opened it", async () => {
    render(
      <>
        <button type="button">Add to playlist</button>
        <PlaylistPicker />
      </>,
    );
    const opener = screen.getByRole("button", { name: "Add to playlist" });
    opener.focus();
    useLibrary.setState({ playlists: [playlist("a", "Mix")] });
    act(() => useUI.getState().openPlaylistPicker([song("s1")]));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: /Mix/ })));

    act(() => useUI.getState().closePlaylistPicker());

    expect(document.activeElement).toBe(opener);
  });
});
