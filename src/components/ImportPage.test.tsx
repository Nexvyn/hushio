import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/bridge")>();
  return { ...actual, spotifyStatus: vi.fn(actual.spotifyStatus), readImportText: vi.fn(async () => "Artist - One") };
});
vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));
vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

Blob.prototype.text ??= function readText(this: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(this);
  });
};

import { ImportPage } from "./ImportPage";
vi.mock("../lib/importBackup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/importBackup")>();
  return { ...actual, exportBackup: vi.fn(async () => {}) };
});
vi.mock("../lib/collectionActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/collectionActions")>();
  return { ...actual, exportPlaylist: vi.fn() };
});
vi.mock("../lib/importStage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/importStage")>();
  return { ...actual, importFromText: vi.fn(actual.importFromText) };
});

import { importFromText, pendingImport, stageImport } from "../lib/importStage";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";
import { exportBackup } from "../lib/importBackup";
import { exportPlaylist } from "../lib/collectionActions";
import { readImportText, spotifyStatus } from "../lib/bridge";

const initialLibrary = useLibrary.getState();

beforeEach(() => {
  cleanup();
  useLibrary.setState(initialLibrary, true);
  useNavigation.setState({ view: { name: "import" }, navPast: [], navFuture: [] });
  useUI.setState({ toasts: [], pendingToasts: [] });
});

async function openPaste(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Paste" }));
  return within(screen.getByRole("dialog"));
}

describe("ImportPage", () => {
  it("lists the six import and export rows and shows no paste field until Paste is clicked", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    expect(screen.getByRole("heading", { name: "Import & export" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Import" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Export" })).toBeTruthy();
    for (const title of [
      "Paste a link or list",
      "Import a file",
      "Spotify",
      "YouTube",
      "Back up your library",
      "Export a playlist",
    ]) {
      expect(screen.getByRole("heading", { name: title, level: 3 })).toBeTruthy();
    }
    expect(screen.queryByLabelText("Playlist or songs")).toBeNull();

    const dialog = await openPaste(user);
    expect(dialog.getByLabelText("Playlist or songs")).toBeTruthy();
    expect((dialog.getByRole("button", { name: "Import" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("imports pasted songs and opens the matched list", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    const dialog = await openPaste(user);
    await user.type(dialog.getByLabelText("Playlist or songs"), "Dua Lipa - Levitating");
    await user.click(dialog.getByRole("button", { name: "Import" }));

    const view = useNavigation.getState().view;
    expect(view.name).toBe("import");
    expect(view.param).toBeTruthy();
    expect(pendingImport(view.param ?? "")?.songs[0]).toMatchObject({ artist: "Dua Lipa", title: "Levitating" });
  });

  it("submits with Ctrl+Enter from the text box", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    const dialog = await openPaste(user);
    await user.type(dialog.getByLabelText("Playlist or songs"), "Artist - Song");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(useNavigation.getState().view.name).toBe("import");
    expect(useNavigation.getState().view.param).toBeTruthy();
  });

  it("explains when the text has no songs", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    const dialog = await openPaste(user);
    await user.type(dialog.getByLabelText("Playlist or songs"), "# just a note");
    await user.click(dialog.getByRole("button", { name: "Import" }));
    expect(useUI.getState().toasts.map((toast) => toast.message)).toContain(
      "No songs found. Paste a playlist link, or one song per line (Artist - Title).",
    );
    expect(useNavigation.getState().view.param).toBeUndefined();
  });

  it("closes the paste dialog with Escape", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    await openPaste(user);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("explains the one-song-per-line format inside the paste dialog", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    const dialog = await openPaste(user);
    expect(dialog.getByText(/one song per line as Artist - Title/)).toBeTruthy();
  });

  it("imports a text file under its name", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    const input = screen.getByLabelText("Choose a playlist file");
    await user.upload(input, new File(["Artist - One"], "Favourites.txt", { type: "text/plain" }));
    await waitFor(() => expect(useNavigation.getState().view.name).toBe("import"));
    const id = useNavigation.getState().view.param ?? "";
    expect(pendingImport(id)?.name).toBe("Favourites");
  });

  it("saves a JSON playlist file as a library playlist and opens it", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    const text = JSON.stringify({
      format: "hushio-playlist",
      name: "Saved file",
      tracks: [{ id: "dQw4w9WgXcQ", title: "Song", artist: "Band" }],
    });
    await user.upload(
      screen.getByLabelText("Choose a playlist file"),
      new File([text], "mix.json", { type: "application/json" }),
    );
    await waitFor(() => expect(useNavigation.getState().view.name).toBe("playlist"));
    const id = useNavigation.getState().view.param;
    expect(useLibrary.getState().playlists.find((item) => item.id === id)?.name).toBe("Saved file");
  });

  it("keeps the import route when the result is a staged import", async () => {
    const user = userEvent.setup();
    const stagedId = stageImport({ name: "Staged", songs: [], total: 0, fromSpotify: false });
    vi.mocked(importFromText).mockResolvedValueOnce(stagedId);
    render(<ImportPage />);
    const dialog = await openPaste(user);
    await user.type(dialog.getByLabelText("Playlist or songs"), "Artist - Song");
    await user.click(dialog.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(useNavigation.getState().view.param).toBe(stagedId));
    expect(useNavigation.getState().view.name).toBe("import");
  });

  it("opens the saved playlist when the result is a saved YouTube playlist", async () => {
    const user = userEvent.setup();
    const savedId = useLibrary.getState().createPlaylist("From YouTube");
    vi.mocked(importFromText).mockResolvedValueOnce(savedId);
    render(<ImportPage />);
    const dialog = await openPaste(user);
    await user.type(dialog.getByLabelText("Playlist or songs"), "https://www.youtube.com/playlist?list=PL1");
    await user.click(dialog.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(useNavigation.getState().view.param).toBe(savedId));
    expect(useNavigation.getState().view.name).toBe("playlist");
  });

  it("accepts several playlist files at once", () => {
    render(<ImportPage />);
    const input = screen.getByLabelText("Choose a playlist file") as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe(".csv,.txt,.m3u8,.m3u,.json");
  });

  it("imports several playlist files in one go and reports the total", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    const playlist = (name: string) =>
      new File(
        [JSON.stringify({ format: "hushio-playlist", name, tracks: [{ id: "dQw4w9WgXcQ", title: "Song", artist: "Band" }] })],
        `${name}.json`,
        { type: "application/json" },
      );
    await user.upload(screen.getByLabelText("Choose a playlist file"), [playlist("First"), playlist("Second")]);

    await waitFor(() => expect(useNavigation.getState().view.name).toBe("playlist"));
    expect(useLibrary.getState().playlists.map((item) => item.name).sort()).toEqual(["First", "Second"]);
    expect(useUI.getState().toasts.map((item) => item.message)).toContain("Imported 2 playlists");
  });

  it("offers Connect for Spotify when the status check fails", async () => {
    vi.mocked(spotifyStatus).mockRejectedValueOnce(new Error("offline"));
    render(<ImportPage />);
    expect(await screen.findByRole("button", { name: "Connect" })).toBeTruthy();
  });

  it("imports a file dropped anywhere on the page", async () => {
    const { container } = render(<ImportPage />);
    const root = container.firstElementChild as HTMLElement;
    const file = new File(["Artist - One"], "Dropped.txt", { type: "text/plain" });
    fireEvent.drop(root, { dataTransfer: { files: [file], types: ["Files"] } });

    await waitFor(() => expect(useNavigation.getState().view.param).toBeTruthy());
    expect(pendingImport(useNavigation.getState().view.param ?? "")?.name).toBe("Dropped");
  });

  it("imports a file from a native drop that the window hands to the page", async () => {
    const { container } = render(<ImportPage />);
    const root = container.firstElementChild as HTMLElement;
    root.dispatchEvent(new CustomEvent("hushio-owned-drop", { detail: { paths: ["C:\\Music\\Dropped.txt"] } }));

    await waitFor(() => expect(useNavigation.getState().view.param).toBeTruthy());
    expect(readImportText).toHaveBeenCalledWith("C:\\Music\\Dropped.txt");
    expect(pendingImport(useNavigation.getState().view.param ?? "")?.name).toBe("Dropped");
  });

  it("saves the library backup from the Back up row without opening a dialog", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);

    await user.click(screen.getByRole("button", { name: "Back up" }));
    expect(exportBackup).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exports the picked playlist in the picked format from the export dialog", async () => {
    const user = userEvent.setup();
    const playlist = { id: "p1", name: "Road trip", folderId: null, pinned: false, tracks: [] };
    useLibrary.setState({ playlists: [playlist] });
    render(<ImportPage />);

    await user.click(screen.getByRole("button", { name: "Export" }));
    const dialog = within(screen.getByRole("dialog"));
    await user.click(dialog.getByRole("radio", { name: "JSON" }));
    await user.click(dialog.getByRole("button", { name: "Export" }));
    expect(exportPlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }), "json");
  });
});
