import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LocalTrack } from "../lib/bridge";

const bridge = vi.hoisted(() => ({ localLibraryEditTags: vi.fn() }));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  platform: "windows",
  localLibraryEditTags: bridge.localLibraryEditTags,
}));

vi.mock("../stores/player", async () => {
  const { create } = await import("zustand");
  return { usePlayer: create(() => ({ queue: [] as unknown[] })) };
});

import { TrackEditDialog } from "./TrackEditDialog";
import { useLocalLibrary } from "../stores/localLibrary";
import { useTrackEdit } from "../stores/trackEdit";

const track: LocalTrack = {
  id: "local:abc",
  path: "C:\\Music\\Old.mp3",
  title: "Old Song",
  artist: "Old Artist",
  album: "Old Album",
  genre: "Rock",
  duration: 200,
  size: 10,
  mtime: 1,
};

function openEditor(current: LocalTrack = track) {
  useLocalLibrary.setState({
    library: { folders: [], scannedAt: 1, tracks: [current], unplayable: [] },
    opened: [],
  });
  useTrackEdit.getState().open(current.id);
  render(<TrackEditDialog />);
}

function field(label: string) {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function saveButton() {
  return screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
}

describe("TrackEditDialog", () => {
  beforeEach(() => {
    bridge.localLibraryEditTags.mockReset();
    useTrackEdit.setState({ id: null, returnTo: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("prefills the fields from the track and focuses the title", () => {
    openEditor();

    expect(field("Title").value).toBe("Old Song");
    expect(field("Artist").value).toBe("Old Artist");
    expect(field("Album").value).toBe("Old Album");
    expect(field("Genre").value).toBe("Rock");
    expect(field("Year").value).toBe("");
    expect(document.activeElement).toBe(field("Title"));
  });

  it("hides the placeholder artist and album names and keeps Save disabled until a field changes", () => {
    openEditor({ ...track, artist: "Unknown artist", album: "Unknown album" });

    expect(field("Artist").value).toBe("");
    expect(field("Album").value).toBe("");
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(field("Title"), { target: { value: "New Song" } });
    expect(saveButton().disabled).toBe(false);

    fireEvent.change(field("Title"), { target: { value: "Old Song" } });
    expect(saveButton().disabled).toBe(true);
  });

  it("shows an inline error for a year that is not a number and sends nothing", () => {
    openEditor();

    fireEvent.change(field("Year"), { target: { value: "19x9" } });
    fireEvent.click(saveButton());

    expect(screen.getByRole("alert").textContent).toBe("Year must be a number.");
    expect(bridge.localLibraryEditTags).not.toHaveBeenCalled();
  });

  it("shows the native error and keeps the dialog open when the save fails", async () => {
    openEditor();
    bridge.localLibraryEditTags.mockRejectedValue("This file is read-only.");

    fireEvent.change(field("Title"), { target: { value: "New Song" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("This file is read-only."));
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(saveButton().disabled).toBe(false);
  });

  it("saves only the changed fields, updates the row text and closes", async () => {
    openEditor();
    const updated = { ...track, title: "New Song" };
    bridge.localLibraryEditTags.mockResolvedValue(updated);

    fireEvent.change(field("Title"), { target: { value: "New Song" } });
    fireEvent.submit(saveButton().form as HTMLFormElement);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(bridge.localLibraryEditTags).toHaveBeenCalledWith("local:abc", { title: "New Song" });
    expect(useLocalLibrary.getState().library.tracks[0].title).toBe("New Song");
  });

  it("sends numbers as numbers and an empty year as a clear", async () => {
    openEditor({ ...track, year: 1999 });
    bridge.localLibraryEditTags.mockResolvedValue(track);

    fireEvent.change(field("Year"), { target: { value: "" } });
    fireEvent.change(field("Track"), { target: { value: "7" } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(bridge.localLibraryEditTags).toHaveBeenCalled());
    expect(bridge.localLibraryEditTags).toHaveBeenCalledWith("local:abc", { year: "", trackNumber: 7 });
  });

  it("Escape closes without saving", () => {
    openEditor();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useTrackEdit.getState().id).toBeNull();
    expect(bridge.localLibraryEditTags).not.toHaveBeenCalled();
  });

  it("Cancel returns focus to the element that opened the editor", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    useLocalLibrary.setState({
      library: { folders: [], scannedAt: 1, tracks: [track], unplayable: [] },
      opened: [],
    });
    useTrackEdit.getState().open(track.id);
    render(<TrackEditDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
