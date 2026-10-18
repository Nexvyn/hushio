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
}));

import { SettingsView } from "./SettingsView";
import { useNavigation } from "../stores/navigation";
import { useSettings } from "../stores/settings";

const initialSettings = useSettings.getState();
const initialNavigation = useNavigation.getState();

function openCategory(name: string) {
  return userEvent.setup().click(screen.getByRole("button", { name }));
}

beforeEach(() => {
  useSettings.setState(initialSettings, true);
  useNavigation.setState(
    { ...initialNavigation, view: { name: "settings" }, navPast: [], navFuture: [] },
    true,
  );
});

afterEach(cleanup);

describe("settings categories", () => {
  it("opens on Account and shows one pane at a time", async () => {
    render(<SettingsView />);

    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeTruthy();

    await openCategory("Playback");

    expect(screen.getByRole("heading", { name: "Playback" })).toBeTruthy();
    expect(screen.getByText("Crossfade")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Account" })).toBeNull();
    expect(screen.queryByText("Streaming quality")).toBeNull();
    expect(screen.getByRole("button", { name: "Playback" }).getAttribute("aria-current")).toBe("page");
  });

  it("switches categories without adding history", async () => {
    render(<SettingsView />);

    await openCategory("About");

    expect(useNavigation.getState().view).toEqual({ name: "settings", param: "about" });
    expect(useNavigation.getState().navPast).toHaveLength(0);
  });
});

describe("settings search", () => {
  it("finds a setting in another category and Escape clears the search", async () => {
    const user = userEvent.setup();
    render(<SettingsView />);
    const search = screen.getByRole("textbox", { name: "Search settings" }) as HTMLInputElement;

    await user.type(search, "Streaming");

    expect(screen.getByRole("heading", { name: "Sound" })).toBeTruthy();
    expect(screen.getByText("Streaming quality")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Account" })).toBeNull();

    await user.keyboard("{Escape}");

    expect(search.value).toBe("");
    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy();
    expect(screen.queryByText("Streaming quality")).toBeNull();
  });

  it("shows the empty message when nothing matches", async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.type(screen.getByRole("textbox", { name: "Search settings" }), "zzqx");

    expect(screen.getByText("No settings match “zzqx”")).toBeTruthy();
  });
});

describe("settings rows", () => {
  it("flips a toggle when its row is clicked, and the switch flips once", async () => {
    const user = userEvent.setup();
    render(<SettingsView />);
    await openCategory("Playback");
    const skipSilence = screen.getByRole("switch", { name: "Skip silence" });
    expect(skipSilence.getAttribute("aria-checked")).toBe("false");

    await user.click(screen.getByText("Skip silence"));

    expect(skipSilence.getAttribute("aria-checked")).toBe("true");
    expect(useSettings.getState().skipSilence).toBe(true);

    await user.click(skipSilence);

    expect(skipSilence.getAttribute("aria-checked")).toBe("false");
  });

  it("shows value text next to the setting", async () => {
    useSettings.setState({ playbackSpeed: 1.25 });
    render(<SettingsView />);
    await openCategory("Playback");

    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.getByText("1.25x")).toBeTruthy();
  });

  it("moves through a radio group with the arrow keys and wraps at the ends", async () => {
    const user = userEvent.setup();
    render(<SettingsView />);
    await openCategory("Sound");
    const high = screen.getByRole("radio", { name: "High" });
    const lossless = screen.getByRole("radio", { name: "Lossless" });
    const low = screen.getByRole("radio", { name: "Low" });

    high.focus();
    await user.keyboard("{ArrowRight}");
    expect(useSettings.getState().streamingQuality).toBe("lossless");
    expect(document.activeElement).toBe(lossless);

    await user.keyboard("{ArrowRight}");
    expect(useSettings.getState().streamingQuality).toBe("low");
    expect(document.activeElement).toBe(low);

    await user.keyboard("{ArrowLeft}");
    expect(useSettings.getState().streamingQuality).toBe("lossless");
    expect(lossless.getAttribute("aria-checked")).toBe("true");
  });
});
