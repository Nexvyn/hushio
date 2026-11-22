import { beforeEach, describe, expect, it, vi } from "vitest";
import { localLibraryEditTags } from "./bridge";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

describe("localLibraryEditTags", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("sends the track id and only the edited fields, and returns the updated track", async () => {
    const track = { id: "local:a", path: "C:\\a.mp3", title: "New", artist: "x", album: "y", duration: 1, size: 2, mtime: 3 };
    invoke.mockResolvedValue(track);

    await expect(localLibraryEditTags("local:a", { title: "New", year: "" })).resolves.toEqual(track);
    expect(invoke.mock.calls[0][0]).toBe("local_library_edit_tags");
    expect(invoke.mock.calls[0][1]).toEqual({ id: "local:a", edits: { title: "New", year: "" } });
  });

  it("passes the plain native error through unchanged", async () => {
    invoke.mockRejectedValue("This file is read-only.");

    await expect(localLibraryEditTags("local:a", { title: "x" })).rejects.toBe("This file is read-only.");
  });
});
