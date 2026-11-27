import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { SpotifyAccount } from "../../lib/bridge";

const bridge = vi.hoisted(() => ({ spotifyStatus: vi.fn() }));

vi.mock("../../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/bridge")>()),
  spotifyStatus: bridge.spotifyStatus,
}));

import { SpotifySettings } from "./SpotifySettings";

const SIGNED_OUT: SpotifyAccount = {
  ownClientId: null,
  expired: false,
  reconnect: false,
  redirectUri: "http://127.0.0.1/callback",
  configured: false,
  signedIn: false,
  name: null,
};

afterEach(() => {
  cleanup();
  bridge.spotifyStatus.mockReset();
});

describe("SpotifySettings", () => {
  it("renders no sign-in button and an open own-app section when not configured", async () => {
    bridge.spotifyStatus.mockResolvedValue(SIGNED_OUT);
    render(<SpotifySettings />);

    await waitFor(() => expect(screen.getByText("Use your own Spotify app")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Sign in with Spotify" })).toBeNull();
    expect(screen.getByLabelText("Client ID")).not.toBeNull();
    expect(screen.getByText("Use your own Spotify app").closest("details")?.hasAttribute("open")).toBe(true);
  });
});
