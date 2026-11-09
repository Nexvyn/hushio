import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../lib/bridge", () => ({
  platform: "android",
  appVersion: async () => "1.1.1",
  persistRead: async () => null,
  persistWrite: async () => true,
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
  it("shows the eight categories as a list first", () => {
    render(<SettingsView />);
    const rows = screen.getAllByRole("button").filter((button) => button.hasAttribute("data-cat"));
    expect(rows.map((row) => row.textContent)).toEqual([
      "Account",
      "Playback",
      "Sound",
      "Lyrics",
      "Display",
      "Library",
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
    expect(screen.getAllByText("Coming in a later version")).toHaveLength(2);
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
