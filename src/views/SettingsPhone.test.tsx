import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/bridge", () => ({
  platform: "android",
  appVersion: async () => "1.1.1",
  persistRead: async () => null,
  persistWrite: async () => true,
  scrobbleStatus: async () => null,
  spotifyStatus: () => new Promise(() => {}),
  discordStatus: async () => null,
  networkServers: async () => null,
}));

import { SettingsView } from "./SettingsView";
import { useNavigation } from "../stores/navigation";
import { useSettings } from "../stores/settings";

const initialSettings = useSettings.getState();
const initialNavigation = useNavigation.getState();

beforeEach(() => {
  window.innerWidth = 400;
  useSettings.setState(initialSettings, true);
  useNavigation.setState(
    { ...initialNavigation, view: { name: "settings" }, navPast: [], navFuture: [] },
    true,
  );
});

afterEach(cleanup);

describe("phone settings", () => {
  it("opens as the settings root with a back arrow and a Downloads row", () => {
    render(<SettingsView />);
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Downloads" }));
    expect(useNavigation.getState().view).toEqual({ name: "downloads" });
  });

  it("opens Account from the profile row", () => {
    render(<SettingsView />);
    fireEvent.click(screen.getByRole("button", { name: /Not signed in/ }));
    expect(useNavigation.getState().view).toEqual({ name: "settings", param: "account" });
  });

  it("lists the eight categories other than Account as flat rows", () => {
    render(<SettingsView />);
    const rows = screen.getAllByRole("button").filter((button) => button.hasAttribute("data-cat"));
    expect(rows.map((row) => row.textContent)).toEqual([
      "Playback",
      "Sound",
      "Lyrics",
      "Display",
      "Library",
      "Scrobbling",
      "Your data",
      "About",
    ]);
  });

  it("opens a category as its own page with a back button", async () => {
    render(<SettingsView />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Playback/ }));

    expect(screen.getByRole("heading", { name: "Playback" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to settings" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Lyrics/ })).toBeNull();
    expect(screen.queryByText("Coming in a later version")).toBeNull();
    expect(screen.queryByText("Crossfade")).toBeNull();
    expect(screen.queryByText("Automix")).toBeNull();
  });

  it("goes back to the list", async () => {
    render(<SettingsView />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Sound/ }));
    await user.click(screen.getByRole("button", { name: "Back to settings" }));

    expect(screen.getByRole("button", { name: /Sound/ })).toBeTruthy();
    expect(useNavigation.getState().view).toEqual({ name: "settings" });
  });

  it("hides the desktop-only Display rows on Android", async () => {
    render(<SettingsView />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Display/ }));
    expect(screen.queryByText("Reduce transparency")).toBeNull();
    expect(screen.queryByText("Hide volume bar")).toBeNull();
    expect(screen.getByText("Reduce animation")).toBeTruthy();
  });
});

describe("phone settings groups", () => {
  it("groups the root categories into four inset lists", () => {
    const { container } = render(<SettingsView />);
    const groups = Array.from(container.querySelectorAll("ul")).map((list) =>
      Array.from(list.querySelectorAll("button[data-cat]")).map((button) => button.textContent),
    );
    expect(groups).toEqual([
      ["Playback", "Sound", "Lyrics"],
      ["Display", "Library"],
      ["Scrobbling", "Your data"],
      ["About"],
    ]);
    expect(container.querySelector("[class*='border-separator']")).toBeNull();
  });
});
