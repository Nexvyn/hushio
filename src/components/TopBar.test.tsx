import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { GoogleAccount, Platform } from "../lib/bridge";

const { audio, playStream, seekTo, typeAhead, peekTypeAhead, chrome } = vi.hoisted(() => ({
  audio: new Audio(),
  playStream: vi.fn(),
  seekTo: vi.fn(),
  typeAhead: vi.fn(),
  peekTypeAhead: vi.fn(),
  chrome: { platform: "windows" as Platform },
}));

vi.mock("../lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/bridge")>()),
  get platform() {
    return chrome.platform;
  },
}));

vi.mock("../lib/audio", () => ({
  audio,
  playStream,
  play: vi.fn(),
  pause: vi.fn(),
  seekTo,
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

vi.mock("../lib/search", () => ({ typeAhead, peekTypeAhead }));

import { TopBar } from "./TopBar";
import { ContextMenu } from "./ContextMenu";
import type { SearchSong, SuggestionRow } from "../lib/searchParse";
import { GUEST_ACCOUNT, useAuth } from "../stores/auth";
import { useNavigation } from "../stores/navigation";
import { usePlayer } from "../stores/player";
import { useRecents } from "../stores/recents";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";

const initialPlayer = usePlayer.getState();

function song(id: string, title: string): SearchSong {
  return {
    id,
    title,
    artist: "Dua Lipa",
    thumb: null,
    artistId: null,
    albumId: null,
    album: null,
    duration: 203,
    explicit: false,
    isVideo: false,
  };
}

const suggestions: SuggestionRow[] = [
  { kind: "completion", text: "dua lipa songs" },
  { kind: "track", track: song("lev", "Levitating") },
  { kind: "browse", item: { type: "artist", browseId: "UC1", title: "Dua Lipa", subtitle: "", thumb: null } },
];

function input(): HTMLElement {
  return screen.getByLabelText("Search");
}

describe("TopBar search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playStream.mockResolvedValue(undefined);
    typeAhead.mockResolvedValue(suggestions);
    peekTypeAhead.mockReturnValue(undefined);
    usePlayer.setState(initialPlayer, true);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "", searchFilter: "all" });
    useRecents.setState({ searches: [] });
    useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [] });
  });

  afterEach(cleanup);

  it("shows type-ahead suggestions after typing, requesting once per pause", async () => {
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(input());
    await user.type(input(), "dua");

    expect(await screen.findByRole("listbox", { name: "Search suggestions" })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Levitating/ })).toBeTruthy();
    expect(typeAhead).toHaveBeenCalledTimes(1);
    expect(typeAhead).toHaveBeenCalledWith("dua");
  });

  it("exposes the highlighted option through the combobox", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    const listbox = await screen.findByRole("listbox");

    expect(input().getAttribute("role")).toBe("combobox");
    expect(input().getAttribute("aria-controls")).toBe(listbox.id);
    expect(input().getAttribute("aria-activedescendant")).toBeNull();

    await user.keyboard("{ArrowDown}{ArrowDown}");

    const active = screen.getByRole("option", { selected: true });
    expect(active.textContent).toContain("dua lipa songs");
    expect(input().getAttribute("aria-activedescendant")).toBe(active.id);
  });

  it("does not ask for suggestions for a single letter", async () => {
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(input());
    await user.type(input(), "d");

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(typeAhead).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("fills the field from a completion without searching", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    await screen.findByRole("listbox");

    await user.click(screen.getByLabelText('Fill in "dua lipa songs"'));

    expect(input()).toHaveProperty("value", "dua lipa songs");
    expect(useUI.getState().searchQuery).toBe("dua lipa songs");
    expect(useNavigation.getState().view.name).toBe("home");
  });

  it("submits the highlighted completion with the keyboard", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(useUI.getState().searchQuery).toBe("dua lipa songs");
    expect(useNavigation.getState().view.name).toBe("search");
    expect(useRecents.getState().searches).toEqual(["dua lipa songs"]);
  });

  it("plays the highlighted song with the keyboard", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    await screen.findByRole("listbox");

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");

    expect(usePlayer.getState().queue.map((track) => track.id)).toEqual(["lev"]);
    expect(useRecents.getState().searches).toEqual(["dua"]);
  });

  it("opens the search page for the typed text when no suggestion is highlighted", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "ab{Enter}");

    expect(useUI.getState().searchQuery).toBe("ab");
    expect(useNavigation.getState().view.name).toBe("search");
    expect(useRecents.getState().searches).toEqual(["ab"]);
  });

  it("closes the suggestions on Escape", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    await screen.findByRole("listbox");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });
});

describe("TopBar window chrome", () => {
  afterEach(() => {
    chrome.platform = "windows";
    cleanup();
  });

  it("hides the caption buttons and leaves 84 px for the traffic lights on macOS", () => {
    chrome.platform = "macos";
    render(<TopBar />);

    expect(screen.queryByRole("button", { name: "Minimize" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.getByRole("banner").style.paddingLeft).toBe("84px");
  });

  it("draws the caption buttons and keeps the normal padding on Windows", () => {
    render(<TopBar />);

    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByRole("banner").style.paddingLeft).toBe("");
  });

  it("draws the caption buttons on Linux too", () => {
    chrome.platform = "linux";
    render(<TopBar />);

    expect(screen.getByRole("button", { name: "Minimize" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByRole("banner").style.paddingLeft).toBe("");
  });
});

describe("TopBar layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    typeAhead.mockResolvedValue(suggestions);
    peekTypeAhead.mockReturnValue(undefined);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "", searchFilter: "all" });
    useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [] });
  });

  afterEach(cleanup);

  it("puts the home button and search field in the centre column of the bar", () => {
    render(<TopBar />);

    const bar = screen.getByRole("banner");
    const centre = screen.getByTestId("topbar-centre");
    expect(bar.children[1]).toBe(centre);
    expect(centre.contains(screen.getByRole("button", { name: "Home" }))).toBe(true);
    expect(centre.contains(input())).toBe(true);
    expect(input().getAttribute("placeholder")).toBe("What do you want to play?");
  });

  it("shows the clear button only while the field has text, and clears the query", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();

    await user.click(input());
    await user.type(input(), "dua");
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(useUI.getState().searchQuery).toBe("");
    expect(input()).toHaveProperty("value", "");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("returns home when the search results page is cleared", async () => {
    const user = userEvent.setup();
    useNavigation.setState({ view: { name: "search" }, navPast: [], navFuture: [] });
    useUI.setState({ searchQuery: "dua" });
    render(<TopBar />);

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(useNavigation.getState().view.name).toBe("home");
  });

  it("marks the home button as the current page on home", () => {
    render(<TopBar />);

    expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("TopBar profile menu", () => {
  const initialAuth = useAuth.getState();
  const google: GoogleAccount = {
    ...GUEST_ACCOUNT,
    mode: "google",
    name: "Aman Gupta",
    email: "aman@example.com",
    googleSub: "sub-1",
    configured: true,
  };

  function profileButton() {
    return screen.getByRole("button", { name: /^Profile menu/ });
  }

  function renderBar() {
    return render(
      <>
        <TopBar />
        <ContextMenu />
      </>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    typeAhead.mockResolvedValue([]);
    peekTypeAhead.mockReturnValue(undefined);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "", searchFilter: "all", contextMenu: null });
    useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [] });
    useAuth.setState({ ...initialAuth, account: GUEST_ACCOUNT }, true);
  });

  afterEach(() => {
    useAuth.setState(initialAuth, true);
    cleanup();
  });

  it("opens the menu for a guest with account items and Sign in, and closes on Escape with focus back on the button", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(profileButton());
    const menu = await screen.findByRole("menu");
    const labels = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    expect(labels).toEqual(["Account", "Settings", "ThemeSystem", "Recents", "Sync statusOff", "Sign in"]);
    expect(profileButton().getAttribute("aria-expanded")).toBe("true");

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(profileButton());
  });

  it("moves focus between items with the arrow keys", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(profileButton());
    const items = within(await screen.findByRole("menu")).getAllByRole("menuitem");

    const start = items.indexOf(document.activeElement as HTMLElement);
    await user.keyboard("{ArrowDown}");

    expect(document.activeElement).toBe(items[(start + 1) % items.length]);
  });

  it("opens Settings from the menu", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(profileButton());
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: /^Settings/ }));

    expect(useNavigation.getState().view).toEqual({ name: "settings" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("starts sign-in from the guest menu", async () => {
    const user = userEvent.setup();
    const signIn = vi.fn(async () => {});
    useAuth.setState({ signIn });
    renderBar();
    await user.click(profileButton());
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Sign in" }));

    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("names the Google account and offers Sign out instead of Sign in", async () => {
    const user = userEvent.setup();
    const requestSignOut = vi.fn();
    useAuth.setState({ account: google, requestSignOut });
    renderBar();

    expect(screen.getByRole("button", { name: "Profile menu: Aman Gupta" })).toBeTruthy();
    await user.click(profileButton());
    const menu = within(await screen.findByRole("menu"));
    expect(menu.queryByRole("menuitem", { name: "Sign in" })).toBeNull();
    expect(menu.getByText("Aman Gupta")).toBeTruthy();

    await user.click(menu.getByRole("menuitem", { name: "Sign out" }));

    expect(requestSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("TopBar theme button", () => {
  beforeEach(() => {
    useSettings.setState({ theme: "light" });
  });

  afterEach(cleanup);

  it("cycles Light, Dark and System through the settings store", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    const button = () => screen.getByRole("button", { name: /^Switch to .+ theme$/ });

    expect(button().getAttribute("aria-label")).toBe("Switch to dark theme");
    await user.click(button());
    expect(useSettings.getState().theme).toBe("dark");
    expect(button().getAttribute("aria-label")).toBe("Switch to system theme");

    await user.click(button());
    expect(useSettings.getState().theme).toBe("system");
    expect(button().getAttribute("aria-label")).toBe("Switch to light theme");

    await user.click(button());
    expect(useSettings.getState().theme).toBe("light");
  });

  it("sits in the top bar as a focusable button", () => {
    render(<TopBar />);
    const button = screen.getByRole("button", { name: "Switch to dark theme" });

    expect(button.closest("header")).not.toBeNull();
    expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    expect(button.getAttribute("title")).toBe("Switch to dark theme");
  });
});
