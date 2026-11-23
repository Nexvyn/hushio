import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const bridge = vi.hoisted(() => ({
  networkServers: vi.fn(),
  networkServerSave: vi.fn(),
  networkServerRemove: vi.fn(),
  networkServerTest: vi.fn(),
  networkServerRefresh: vi.fn(),
}));

vi.mock("../../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/bridge")>()),
  networkServers: bridge.networkServers,
  networkServerSave: bridge.networkServerSave,
  networkServerRemove: bridge.networkServerRemove,
  networkServerTest: bridge.networkServerTest,
  networkServerRefresh: bridge.networkServerRefresh,
}));

import { useNetwork } from "../../stores/network";
import { NetworkServersSettings } from "./NetworkServersSettings";

const home = {
  id: "s1",
  kind: "subsonic" as const,
  kindLabel: "Music server",
  name: "Home",
  url: "https://music.example",
  host: "",
  share: "",
  path: "",
  username: "me",
  scannedAt: 1,
  songCount: 42,
  truncated: false,
  scanning: false,
  scanError: "",
};

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Add a server" }));
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  useNetwork.setState({ servers: [], tracks: {}, busy: false });
  bridge.networkServers.mockResolvedValue([]);
});

afterEach(cleanup);

describe("NetworkServersSettings music server form", () => {
  it("asks for the address, username and password before saving", async () => {
    render(<NetworkServersSettings />);
    openForm();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Give the server address, such as https://music.example.");
    expect(bridge.networkServerSave).not.toHaveBeenCalled();
  });

  it("shows the connection as connected when the test succeeds", async () => {
    bridge.networkServerTest.mockResolvedValue("Connected to navidrome 0.53.3");
    render(<NetworkServersSettings />);
    openForm();
    fill("Server address", "https://music.example");
    fill("Username", "me");
    fill("Password", "hunter2");
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Connected to navidrome 0.53.3")).toBeTruthy();
    expect(bridge.networkServerTest).toHaveBeenCalledWith(expect.objectContaining({ kind: "subsonic", password: "hunter2" }));
  });

  it("shows the plain reason when the test fails", async () => {
    bridge.networkServerTest.mockRejectedValue(new Error("Wrong username or password."));
    render(<NetworkServersSettings />);
    openForm();
    fill("Server address", "https://music.example");
    fill("Username", "me");
    fill("Password", "nope");
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Couldn't connect. Wrong username or password.")).toBeTruthy();
  });

  it("warns that plain http sends the password hash without encryption", () => {
    render(<NetworkServersSettings />);
    openForm();
    fill("Server address", "http://192.168.1.5:4533");
    expect(screen.getByText(/sent as a hash without encryption/)).toBeTruthy();
  });

  it("saves without the password in the persisted store or local storage", async () => {
    bridge.networkServerSave.mockResolvedValue([home]);
    render(<NetworkServersSettings />);
    openForm();
    fill("Server address", "https://music.example");
    fill("Username", "me");
    fill("Password", "hunter2-secret");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bridge.networkServerSave).toHaveBeenCalled());
    expect(JSON.stringify(useNetwork.getState())).not.toContain("hunter2-secret");
    expect(JSON.stringify({ ...localStorage })).not.toContain("hunter2-secret");
  });

  it("lists a saved server with its song count and removes it", async () => {
    bridge.networkServers.mockResolvedValue([home]);
    bridge.networkServerRemove.mockResolvedValue([]);
    render(<NetworkServersSettings />);
    expect(await screen.findByText("42 songs")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Home" }));
    await waitFor(() => expect(bridge.networkServerRemove).toHaveBeenCalledWith("s1"));
  });
});
