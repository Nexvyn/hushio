import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
import { pendingImport } from "../lib/importStage";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";

const initialLibrary = useLibrary.getState();

beforeEach(() => {
  cleanup();
  useLibrary.setState(initialLibrary, true);
  useNavigation.setState({ view: { name: "import" }, navPast: [], navFuture: [] });
  useUI.setState({ toasts: [], pendingToasts: [] });
});

describe("ImportPage", () => {
  it("shows the heading, the link label and a disabled Import button until there is text", () => {
    render(<ImportPage />);
    expect(screen.getByRole("heading", { name: "Import" })).toBeTruthy();
    expect(screen.getByLabelText("Playlist link")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Import" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("imports pasted songs and opens the matched list", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    await user.type(screen.getByLabelText("Playlist link"), "Dua Lipa - Levitating");
    await user.click(screen.getByRole("button", { name: "Import" }));

    const view = useNavigation.getState().view;
    expect(view.name).toBe("import");
    expect(view.param).toBeTruthy();
    expect(pendingImport(view.param ?? "")?.songs[0]).toMatchObject({ artist: "Dua Lipa", title: "Levitating" });
  });

  it("submits with Ctrl+Enter from the text box", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    await user.type(screen.getByLabelText("Playlist link"), "Artist - Song");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(useNavigation.getState().view.name).toBe("import");
    expect(useNavigation.getState().view.param).toBeTruthy();
  });

  it("explains when the text has no songs", async () => {
    const user = userEvent.setup();
    render(<ImportPage />);
    await user.type(screen.getByLabelText("Playlist link"), "# just a note");
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(useUI.getState().toasts.map((toast) => toast.message)).toContain(
      "No songs found. Paste a playlist link, or one song per line (Artist - Title).",
    );
    expect(useNavigation.getState().view.param).toBeUndefined();
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
});
