import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));
vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  googleSignIn: vi.fn(),
  ytMyPlaylists: vi.fn(),
  ytPlaylistVideos: vi.fn(),
  ytLinkPlaylist: vi.fn(),
}));

import { YouTubePlaylists } from "./YouTubePlaylists";
import { GUEST_ACCOUNT, useAuth } from "../stores/auth";
import { useLibrary } from "../stores/library";
import { useNavigation } from "../stores/navigation";
import { useUI } from "../stores/ui";
import { googleSignIn, ytLinkPlaylist, ytMyPlaylists, ytPlaylistVideos } from "../lib/bridge";

const initialLibrary = useLibrary.getState();
const initialAuth = useAuth.getState();

const playlists = [
  { id: "PL1", title: "Road", count: 3, thumbnail: null },
  { id: "PL2", title: "Late night", count: 1, thumbnail: "https://img.example/late.jpg" },
];

const videos = {
  PL1: [
    { videoId: "v1", title: "One", artist: "Band A", durationSeconds: 200, thumbnail: null },
    { videoId: "v2", title: "Two", artist: "Band B", durationSeconds: null, thumbnail: null },
    { videoId: "v1", title: "One again", artist: "Band A", durationSeconds: 200, thumbnail: null },
  ],
  PL2: [{ videoId: "v9", title: "Nine", artist: "Band C", durationSeconds: 90, thumbnail: null }],
};

function signInAs(mode: "google" | "guest") {
  useAuth.setState({
    ...initialAuth,
    account: mode === "google" ? { ...GUEST_ACCOUNT, mode, googleSub: "sub", name: "Ana" } : GUEST_ACCOUNT,
    signingIn: false,
    loaded: true,
  });
}

function section() {
  return screen.getByRole("region", { name: "YouTube playlists" });
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  useLibrary.setState(initialLibrary, true);
  useNavigation.setState({ view: { name: "import" }, navPast: [], navFuture: [] });
  useUI.setState({ toasts: [], pendingToasts: [] });
  vi.mocked(ytMyPlaylists).mockResolvedValue(playlists);
  vi.mocked(ytPlaylistVideos).mockImplementation(async (id: string) => videos[id as keyof typeof videos]);
  vi.mocked(ytLinkPlaylist).mockResolvedValue(undefined);
});

describe("YouTubePlaylists", () => {
  it("asks a signed out user to sign in and does not read playlists", async () => {
    signInAs("guest");
    vi.mocked(googleSignIn).mockResolvedValue({ ...GUEST_ACCOUNT, mode: "google", googleSub: "sub" });
    render(<YouTubePlaylists />);

    expect(within(section()).getByText("Sign in with Google to bring in your YouTube playlists")).toBeTruthy();
    expect(ytMyPlaylists).not.toHaveBeenCalled();
    await userEvent.click(within(section()).getByRole("button", { name: "Sign in" }));

    expect(googleSignIn).toHaveBeenCalledTimes(1);
  });

  it("lists the signed in user's playlists with song counts and an Import button each", async () => {
    signInAs("google");
    render(<YouTubePlaylists />);

    expect(await within(section()).findByText("Road")).toBeTruthy();
    expect(within(section()).getByText("3 songs")).toBeTruthy();
    expect(within(section()).getByText("Late night")).toBeTruthy();
    expect(within(section()).getByText("1 song")).toBeTruthy();
    expect(within(section()).getAllByRole("button", { name: "Import" })).toHaveLength(2);
    expect((within(section()).getByRole("button", { name: "Import all" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the error and retries when the playlists cannot be read", async () => {
    signInAs("google");
    vi.mocked(ytMyPlaylists).mockRejectedValueOnce(new Error("Couldn't reach YouTube."));
    render(<YouTubePlaylists />);

    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't reach YouTube.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await within(section()).findByText("Road")).toBeTruthy();
  });

  it("imports one playlist as a linked local playlist without a duplicate song", async () => {
    signInAs("google");
    render(<YouTubePlaylists />);
    await within(section()).findByText("Road");

    const rows = within(section()).getAllByRole("listitem");
    await userEvent.click(within(rows[0]).getByRole("button", { name: "Import" }));

    expect(ytPlaylistVideos).toHaveBeenCalledWith("PL1");
    expect(ytLinkPlaylist).toHaveBeenCalledWith(expect.any(String), "PL1");
    const local = useLibrary.getState().playlists.find((playlist) => playlist.remote?.ytPlaylistId === "PL1");
    expect(local?.name).toBe("Road");
    expect(local?.tracks.map((track) => track.id)).toEqual(["v1", "v2"]);
    expect(local?.tracks[0].duration).toBe(200);
    expect(local?.remote?.imported).toBe(true);
    expect(await within(rows[0]).findByText("Imported")).toBeTruthy();
    expect(within(rows[0]).getByRole("button", { name: "Open" })).toBeTruthy();
    expect(useLibrary.getState().playlists.filter((playlist) => playlist.remote)).toHaveLength(1);
  });

  it("imports every playlist with Import all and links each one", async () => {
    signInAs("google");
    render(<YouTubePlaylists />);
    await within(section()).findByText("Road");

    await userEvent.click(within(section()).getByRole("button", { name: "Import all" }));

    await waitFor(() => expect(ytPlaylistVideos).toHaveBeenCalledTimes(2));
    expect(ytPlaylistVideos).toHaveBeenNthCalledWith(1, "PL1");
    expect(ytPlaylistVideos).toHaveBeenNthCalledWith(2, "PL2");
    expect(ytLinkPlaylist).toHaveBeenCalledTimes(2);
    const linked = useLibrary.getState().playlists.filter((playlist) => playlist.remote);
    expect(linked.map((playlist) => playlist.remote?.ytPlaylistId).sort()).toEqual(["PL1", "PL2"]);
    await waitFor(() => expect(within(section()).getAllByText("Imported")).toHaveLength(2));
    expect((within(section()).getByRole("button", { name: "Import all" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
