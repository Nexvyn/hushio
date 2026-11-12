import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));
vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  ytEnqueue: vi.fn(async () => {}),
  ytUnlinkPlaylist: vi.fn(async () => {}),
}));

import { ytEnqueue, ytUnlinkPlaylist } from "../lib/bridge";
import { openDeletePlaylist } from "../lib/collectionActions";
import { GUEST_ACCOUNT, useAuth } from "./auth";
import { type Playlist, useLibrary } from "./library";
import { useUI } from "../stores/ui";

const initialLibrary = useLibrary.getState();
const initialUI = useUI.getState();

function playlist(id: string, remote?: Playlist["remote"]): Playlist {
  return { id, name: `Playlist ${id}`, folderId: null, pinned: false, tracks: [], remote };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.setState({ account: { ...GUEST_ACCOUNT, mode: "google", googleSub: "sub" }, signingIn: false, loaded: true });
  useLibrary.setState(initialLibrary, true);
  useUI.setState({ ...initialUI, dialog: null });
});

describe("deleting a playlist that is linked to YouTube", () => {
  it("removes an imported playlist from Hushio only and sends no delete to YouTube", () => {
    useLibrary.setState({ playlists: [playlist("imp", { ytPlaylistId: "PL1", imported: true })] });

    useLibrary.getState().deletePlaylist("imp");

    expect(useLibrary.getState().playlists).toEqual([]);
    expect(ytUnlinkPlaylist).toHaveBeenCalledWith("imp");
    expect(ytEnqueue).not.toHaveBeenCalled();
  });

  it("still deletes a playlist made in Hushio on YouTube too", () => {
    useLibrary.setState({ playlists: [playlist("made", { ytPlaylistId: "PL2" })] });

    useLibrary.getState().deletePlaylist("made");

    expect(ytEnqueue).toHaveBeenCalledWith([{ kind: "delete", localPlaylistId: "made", ytPlaylistId: "PL2" }]);
    expect(ytUnlinkPlaylist).not.toHaveBeenCalled();
  });

  it("tells the owner an imported playlist stays on YouTube in the confirmation", () => {
    useLibrary.setState({ playlists: [playlist("imp", { ytPlaylistId: "PL1", imported: true })] });

    openDeletePlaylist("imp");

    expect(useUI.getState().dialog?.body).toBe("Removes it from Hushio only. The playlist and its songs stay on YouTube.");
  });

  it("keeps the usual confirmation for a playlist made in Hushio", () => {
    useLibrary.setState({ playlists: [playlist("made", { ytPlaylistId: "PL2" })] });

    openDeletePlaylist("made");

    expect(useUI.getState().dialog?.body).toBe("This can't be undone. The tracks themselves aren't affected.");
  });
});
