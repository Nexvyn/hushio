import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.hoisted(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  }
});

vi.mock("../lib/bridge", () => ({
  platform: "windows",
  appVersion: async () => "1.1.1",
  persistRead: async () => null,
  persistWrite: async () => true,
  listenUpdates: async () => () => {},
  openExternal: vi.fn(async () => {}),
  updatesState: async () => ({ status: "idle" }),
  updatesCheck: vi.fn(async () => {}),
  updatesInstall: vi.fn(async () => {}),
  updatesRestart: vi.fn(async () => {}),
  scrobbleStatus: async () => null,
  discordStatus: async () => null,
  networkServers: async () => null,
}));

import * as bridge from "../lib/bridge";
import { INITIAL_UPDATE_STATE, type UpdateState } from "../lib/updates";
import { useNavigation } from "../stores/navigation";
import { useSettings } from "../stores/settings";
import { useUpdates } from "../stores/updates";
import { SettingsView } from "./SettingsView";

const bridgeMock = vi.mocked(bridge);
const initialSettings = useSettings.getState();
const initialNavigation = useNavigation.getState();

function setUpdate(patch: Partial<UpdateState>) {
  useUpdates.setState({ state: { ...INITIAL_UPDATE_STATE, current: "1.1.1", ...patch } });
}

beforeEach(() => {
  useSettings.setState(initialSettings, true);
  useNavigation.setState(
    { ...initialNavigation, view: { name: "settings", param: "about" }, navPast: [], navFuture: [] },
    true,
  );
  bridgeMock.updatesCheck.mockClear();
  bridgeMock.updatesInstall.mockClear();
  bridgeMock.updatesRestart.mockClear();
  bridgeMock.openExternal.mockClear();
  setUpdate({});
});

afterEach(cleanup);

describe("About update rows", () => {
  it("offers a check when nothing is known yet", async () => {
    render(<SettingsView />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Check for updates" }));

    expect(bridgeMock.updatesCheck).toHaveBeenCalledTimes(1);
  });

  it("shows checking without a button", () => {
    setUpdate({ status: "checking" });
    render(<SettingsView />);

    expect(screen.getByText("Checking for updates…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
  });

  it("installs in the app when an update is available", async () => {
    setUpdate({ status: "available", version: "1.2.0", route: "inApp" });
    render(<SettingsView />);

    expect(screen.getByText("Version 1.2.0 is available")).toBeTruthy();
    expect(screen.getByText("You have version 1.1.1. It installs right here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Release notes" })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Update" }));

    expect(bridgeMock.updatesInstall).toHaveBeenCalledTimes(1);
  });

  it("opens the download page on the website route", async () => {
    setUpdate({ status: "available", version: "1.2.0", route: "website" });
    render(<SettingsView />);

    expect(screen.getByText("You have version 1.1.1. Get it from hushio.space.")).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Download" }));

    expect(bridgeMock.openExternal).toHaveBeenCalledWith("https://hushio.space");
    expect(bridgeMock.updatesInstall).not.toHaveBeenCalled();
  });

  it("shows download progress without a button", () => {
    setUpdate({ status: "downloading", version: "1.2.0", percent: 37 });
    render(<SettingsView />);

    expect(screen.getByText("Downloading version 1.2.0…")).toBeTruthy();
    expect(screen.getByText("37%")).toBeTruthy();
  });

  it("restarts once the update is ready", async () => {
    setUpdate({ status: "ready", version: "1.2.0" });
    render(<SettingsView />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Restart to update" }));

    expect(bridgeMock.updatesRestart).toHaveBeenCalledTimes(1);
  });

  it("shows the install error text", () => {
    setUpdate({
      status: "error",
      version: "1.2.0",
      error: "The update couldn't download. Download it from hushio.space instead.",
      errorFrom: "install",
    });
    render(<SettingsView />);

    expect(screen.getByText("Couldn't update")).toBeTruthy();
    expect(screen.getByText("The update couldn't download. Download it from hushio.space instead.")).toBeTruthy();
  });
});
