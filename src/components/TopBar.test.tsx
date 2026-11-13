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

const appSources = import.meta.glob("../**/*.{ts,tsx,css}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

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

describe("TopBar squircle controls", () => {
  afterEach(() => {
    chrome.platform = "windows";
    cleanup();
  });

  it("gives the nav, home, search, theme and profile controls 40px squircle shapes", () => {
    render(<TopBar />);

    for (const name of ["Back", "Forward", "Home"]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("h-10");
      expect(button.className).toContain("w-10");
      expect(button.className).toContain("rounded-[12px]");
      expect(button.className).toContain("[corner-shape:squircle]");
    }
    const explore = screen.getByRole("button", { name: "Explore" });
    expect(input().parentElement?.contains(explore)).toBe(true);
    expect(screen.getByRole("button", { name: "Back" }).parentElement?.contains(explore)).toBe(false);
    expect(explore.className).toContain("h-10");
    expect(explore.className).toContain("w-10");
    expect(explore.className).toContain("absolute");
    expect(explore.className).toContain("[corner-shape:squircle]");
    expect(screen.getByRole("button", { name: /^Switch to .* theme$/ }).className).toContain("[corner-shape:squircle]");
    for (const button of [screen.getByRole("button", { name: /^Switch to .* theme$/ }), screen.getByRole("button", { name: /^Profile menu/ })]) {
      expect(button.className).toContain("lifted-hover");
      expect(button.className).not.toContain("lifted-fill");
      expect(button.className).not.toContain("lifted-edge");
      expect(button.className).toContain("h-10");
      expect(button.className).toContain("w-10");
    }
    const profile = screen.getByRole("button", { name: /^Profile menu/ });
    expect(profile.className).toContain("h-10");
    expect(profile.className).toContain("w-10");
    expect(profile.className).toContain("rounded-[12px]");
    expect(profile.className).toContain("[corner-shape:squircle]");
    expect(profile.className).toContain("overflow-hidden");
    expect(profile.className).toContain("focus-visible:ring-focus");
  });

  it("gives the search field a 40px squircle instead of a pill", () => {
    render(<TopBar />);

    const field = input();
    expect(field.className).toContain("h-10");
    expect(field.className).toContain("rounded-[12px]");
    expect(field.className).toContain("[corner-shape:squircle]");
    expect(field.className).not.toContain("rounded-full");
  });

  it("uses the compact caption buttons with no gaps and 16px right padding on Windows", () => {
    render(<TopBar />);

    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).toContain("[corner-shape:squircle]");
    expect(close.className).toContain("h-10");
    expect(close.parentElement?.className).toContain("gap-0");
    expect(screen.getByRole("banner").className).toContain("pr-4");
  });
});

describe("TopBar dark surfaces and centring", () => {
  afterEach(cleanup);

  it("gives the field a lifted fill, a hairline edge and a readable placeholder", () => {
    render(<TopBar />);

    const field = input();
    expect(field.className).toContain("lifted-fill");
    expect(field.className).toContain("lifted-edge");
    expect(field.className).toContain("lifted-field");
    expect(field.className).toContain("placeholder:text-ink-1/60");
    expect(field.className).not.toContain("bg-wash");
  });

  it("gives only the Home button the lifted field fill, and the theme button none", () => {
    useNavigation.setState({ view: { name: "library" }, navPast: [], navFuture: [] });
    render(<TopBar />);

    const home = screen.getByRole("button", { name: "Home" });
    expect(home.className).toContain("lifted-fill");
    expect(home.className).toContain("lifted-edge");
    const theme = screen.getByRole("button", { name: /^Switch to .+ theme$/ });
    expect(theme.className).not.toContain("lifted-fill");
    expect(theme.className).not.toContain("lifted-edge");
  });

  it("centres icon buttons with place-items-center", () => {
    render(<TopBar />);

    for (const name of ["Back", "Forward", "Home", "Explore", "Switch to", "Profile menu"]) {
      const button = screen.getByRole("button", { name: new RegExp(`^${name}`) });
      expect(button.className).toContain("place-items-center");
    }
  });
});

describe("TopBar goo dropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    typeAhead.mockResolvedValue(suggestions);
    peekTypeAhead.mockReturnValue(undefined);
    useUI.setState({ toasts: [], pendingToasts: [], searchQuery: "", searchFilter: "all" });
    useNavigation.setState({ view: { name: "home" }, navPast: [], navFuture: [] });
  });

  afterEach(cleanup);

  it("defines the goo filter exactly once in the app source", () => {
    const definitions = Object.entries(appSources)
      .filter(([path]) => !path.includes(".test."))
      .filter(([, source]) => source.includes('GOO_FILTER_ID = "goo"'));
    expect(definitions.length).toBe(1);
  });

  it("puts the goo filter on the background layer only, never on the text", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    const listbox = await screen.findByRole("listbox", { name: "Search suggestions" });

    const layer = listbox.querySelector<HTMLElement>("[data-goo-layer]");
    expect(layer?.style.filter).toContain("url(#goo)");
    const option = screen.getByRole("option", { name: /Levitating/ });
    expect(option.closest("[data-goo-layer]")).toBeNull();
    expect(layer?.contains(option)).toBe(false);
  });

  it("attaches the panel to the field with no gap", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    const listbox = await screen.findByRole("listbox", { name: "Search suggestions" });

    expect(listbox.className).toContain("top-0");
    expect(listbox.className).not.toContain("top-full");
    expect(listbox.querySelector("[data-goo-panel]")?.className).toContain("top-10");
  });

  it("keeps the field above the goo layer so its text stays sharp", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");
    await screen.findByRole("listbox");

    expect(input().className).toContain("z-[60]");
    expect(input().getAttribute("data-open")).toBe("true");
  });
});

describe("TopBar height", () => {
  afterEach(cleanup);

  it("is 56 px tall and no 68 px top bar is left in the source", () => {
    render(<TopBar />);

    expect(screen.getByRole("banner").className).toContain("h-14");
    const stale = Object.entries(appSources)
      .filter(([path]) => !path.includes(".test."))
      .filter(([, source]) => /\b68\s?px\b|h-\[68px\]/.test(source))
      .map(([path]) => path);
    expect(stale).toEqual([]);
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

  it("places the clear button left of Explore inside the field and keeps the text clear of both", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    expect(input().className).toContain("pr-10");

    await user.click(input());
    await user.type(input(), "dua");

    expect(input().className).toContain("pr-[4.25rem]");
    expect(screen.getByRole("button", { name: "Clear search" }).className).toContain("right-[44px]");
    expect(screen.getByRole("button", { name: "Explore" }).className).toContain("right-0");
  });

  it("styles the suggestion dropdown as a scrollbar-free float under the field", async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(input());
    await user.type(input(), "dua");

    const listbox = await screen.findByRole("listbox", { name: "Search suggestions" });
    expect(listbox.className).toContain("no-scrollbar");
    expect(listbox.className).not.toMatch(/overflow-(y-)?auto/);
    for (const token of ["left-0", "right-0", "top-0", "no-scrollbar"]) {
      expect(listbox.className).toContain(token);
    }
    expect(listbox.className).not.toContain("mt-2");
    expect(listbox.className).not.toContain("border-separator");
    expect(screen.getByRole("option", { name: /Levitating/ }).className).toContain("h-10");
    expect(screen.getByRole("option", { name: /Levitating/ }).className).toContain("px-3");
  });

  it("opens the dropdown without motion under reduced motion", async () => {
    document.documentElement.classList.add("reduce-motion");
    try {
      const user = userEvent.setup();
      render(<TopBar />);
      await user.click(input());
      await user.type(input(), "dua");
      const listbox = await screen.findByRole("listbox", { name: "Search suggestions" });
      const panel = listbox.querySelector<HTMLElement>("[data-goo-panel]");
      expect(panel?.style.transform).not.toContain("scaleY(0)");
      expect(listbox.querySelector<HTMLElement>("[data-goo-layer]")?.style.filter).toContain("url(#goo)");
    } finally {
      document.documentElement.classList.remove("reduce-motion");
    }
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
    vi.unstubAllEnvs();
    cleanup();
  });

  it("opens the menu for a guest with account items and Sign in, and closes on Escape with focus back on the button", async () => {
    vi.stubEnv("DEV", false);
    const user = userEvent.setup();
    renderBar();

    await user.click(profileButton());
    const menu = await screen.findByRole("menu");
    const labels = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    expect(labels).toEqual(["Account", "Recents", "SyncOff", "Settings", "Sign in"]);
    expect(profileButton().getAttribute("aria-expanded")).toBe("true");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
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
    expect(menu.queryByText("Not signed in")).toBeNull();

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

describe("TopBar streak", () => {
  afterEach(cleanup);

  it("has no listening streak control", () => {
    render(<TopBar />);

    expect(screen.queryByRole("button", { name: /streak/i })).toBeNull();
    expect(screen.queryByText(/streak/i)).toBeNull();
  });
});

describe("TopBar Explore button", () => {
  afterEach(cleanup);

  it("shows the active Explore page as a subtle tint with no border or outline", () => {
    useNavigation.setState({ view: { name: "explore" } });
    render(<TopBar />);

    const explore = screen.getByRole("button", { name: "Explore" });
    const classes = explore.className.split(/s+/).filter((token) => !token.includes(":"));

    expect(explore.getAttribute("aria-current")).toBe("page");
    expect(explore.className).toContain("lifted-tint");
    expect(classes.some((token) => token.startsWith("border") || token.startsWith("outline") || token.startsWith("ring"))).toBe(false);
  });
});

describe("TopBar avatar attached menu", () => {
  const initialAuth = useAuth.getState();

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

  it("opens the account menu as an attached goo menu and marks the avatar open", async () => {
    const user = userEvent.setup();
    render(
      <>
        <TopBar />
        <ContextMenu />
      </>,
    );
    const avatar = () => screen.getByRole("button", { name: /^Profile menu/ });

    expect(avatar().getAttribute("data-open")).toBeNull();
    await user.click(avatar());

    expect(useUI.getState().contextMenu?.attached).toBe(true);
    expect(avatar().getAttribute("data-open")).toBe("true");
    expect(avatar().className).toContain("z-[110]");
    expect(document.querySelector("[data-goo-layer]")).not.toBeNull();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(avatar().getAttribute("data-open")).toBeNull();
  });
});
