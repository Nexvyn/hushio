import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { Dialog } from "../components/Dialog";
import {
  openCreateFolder,
  openCreatePlaylist,
  openDeletePlaylist,
  openRenameFolder,
  openRenamePlaylist,
} from "./collectionActions";
import { type Playlist, useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

const initialLibrary = useLibrary.getState();
const initialNavigation = useNavigation.getState();
const initialUI = useUI.getState();

const roadTrip: Playlist = { id: "p1", name: "Road trip", folderId: null, pinned: false, tracks: [] };

beforeEach(() => {
  useLibrary.setState(initialLibrary, true);
  useNavigation.setState(initialNavigation, true);
  useUI.setState({ ...initialUI, dialog: null }, true);
});

afterEach(cleanup);

function openDialog(open: () => void) {
  render(<Dialog />);
  act(() => open());
}

describe("create playlist dialog", () => {
  it("creates the playlist with the typed name and opens it", () => {
    openDialog(openCreatePlaylist);
    const input = screen.getByPlaceholderText("Playlist name") as HTMLInputElement;
    expect(input.value).toBe("My Playlist #1");

    fireEvent.change(input, { target: { value: "  Road trip " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const created = useLibrary.getState().playlists;
    expect(created.map((item) => item.name)).toEqual(["Road trip"]);
    expect(useNavigation.getState().view).toEqual({ name: "playlist", param: created[0].id });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses the suggested name when the field is blank", () => {
    useLibrary.setState({ playlists: [roadTrip] });
    openDialog(openCreatePlaylist);
    fireEvent.change(screen.getByPlaceholderText("Playlist name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(useLibrary.getState().playlists.map((item) => item.name)).toEqual(["My Playlist #2", "Road trip"]);
  });

  it("creates on Enter", () => {
    openDialog(openCreatePlaylist);
    const input = screen.getByPlaceholderText("Playlist name");
    fireEvent.change(input, { target: { value: "Late night" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(useLibrary.getState().playlists.map((item) => item.name)).toEqual(["Late night"]);
  });

  it("creates nothing when cancelled", () => {
    openDialog(openCreatePlaylist);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(useLibrary.getState().playlists).toEqual([]);
    expect(useUI.getState().dialog).toBeNull();
  });
});

describe("rename and folder dialogs", () => {
  it("renames a playlist from its current name", () => {
    useLibrary.setState({ playlists: [roadTrip] });
    openDialog(() => openRenamePlaylist("p1"));
    const input = screen.getByPlaceholderText("Playlist name") as HTMLInputElement;
    expect(input.value).toBe("Road trip");

    fireEvent.change(input, { target: { value: "Trip" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(useLibrary.getState().playlists[0].name).toBe("Trip");
  });

  it("keeps the name when the rename is left blank", () => {
    useLibrary.setState({ playlists: [roadTrip] });
    openDialog(() => openRenamePlaylist("p1"));
    fireEvent.change(screen.getByPlaceholderText("Playlist name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(useLibrary.getState().playlists[0].name).toBe("Road trip");
  });

  it("creates a folder with the typed name", () => {
    openDialog(openCreateFolder);
    fireEvent.change(screen.getByPlaceholderText("Folder name"), { target: { value: "Chill" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(useLibrary.getState().folders.map((item) => item.name)).toEqual(["Chill"]);
  });

  it("renames a folder", () => {
    useLibrary.setState({ folders: [{ id: "f1", name: "Chill" }] });
    openDialog(() => openRenameFolder("f1"));
    fireEvent.change(screen.getByPlaceholderText("Folder name"), { target: { value: "Calm" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(useLibrary.getState().folders).toEqual([{ id: "f1", name: "Calm" }]);
  });
});

describe("delete playlist dialog", () => {
  it("names the playlist, keeps its songs, and deletes on confirm", () => {
    useLibrary.setState({ playlists: [roadTrip] });
    openDialog(() => openDeletePlaylist("p1"));

    expect(screen.getByText('Deleting "Road trip" keeps all of its songs.')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(useLibrary.getState().playlists).toEqual([]);
    expect(useNavigation.getState().view).toEqual({ name: "library" });
  });
});
