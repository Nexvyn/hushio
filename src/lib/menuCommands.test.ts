import { describe, expect, it, vi, type Mock } from "vitest";
import { dispatchMenuCommand, historyCommand, isMenuCommand, MENU_COMMANDS, type MenuDeps } from "./menuCommands";

function anyCalled(deps: MenuDeps) {
  return Object.values(deps).some((fn) => ((fn as unknown as Mock).mock?.calls.length ?? 0) > 0);
}

function fakeDeps(overrides: Partial<MenuDeps> = {}): MenuDeps {
  return {
    toggle: vi.fn(),
    pause: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    toggleShuffle: vi.fn(),
    setRepeat: vi.fn(),
    sleep: vi.fn(),
    sleepAtSongEnd: vi.fn(),
    cancelSleep: vi.fn(),
    toggleQueue: vi.fn(),
    toggleLyrics: vi.fn(),
    toggleNowPlaying: vi.fn(),
    openSettings: vi.fn(),
    focusSearch: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    layered: () => false,
    ...overrides,
  };
}

describe("dispatchMenuCommand", () => {
  it.each([
    ["play-pause", "toggle"],
    ["pause", "pause"],
    ["next", "next"],
    ["previous", "previous"],
    ["shuffle", "toggleShuffle"],
    ["sleep-end", "sleepAtSongEnd"],
    ["sleep-off", "cancelSleep"],
    ["queue", "toggleQueue"],
    ["lyrics", "toggleLyrics"],
    ["now-playing", "toggleNowPlaying"],
    ["settings", "openSettings"],
    ["focus-search", "focusSearch"],
    ["history-back", "goBack"],
    ["history-forward", "goForward"],
  ] as const)("%s calls %s", (command, method) => {
    const deps = fakeDeps();
    expect(dispatchMenuCommand(command, deps)).toBe(true);
    expect(deps[method]).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["repeat-off", "off"],
    ["repeat-all", "all"],
    ["repeat-one", "one"],
  ] as const)("%s sets the repeat mode directly", (command, mode) => {
    const deps = fakeDeps();
    expect(dispatchMenuCommand(command, deps)).toBe(true);
    expect(deps.setRepeat).toHaveBeenCalledWith(mode);
  });

  it.each([
    ["sleep-15", 15],
    ["sleep-30", 30],
    ["sleep-60", 60],
  ] as const)("%s starts a %d minute timer", (command, minutes) => {
    const deps = fakeDeps();
    expect(dispatchMenuCommand(command, deps)).toBe(true);
    expect(deps.sleep).toHaveBeenCalledWith(minutes);
  });

  it("ignores focus-search while a dialog, menu or picker is open", () => {
    const deps = fakeDeps({ layered: () => true });
    expect(dispatchMenuCommand("focus-search", deps)).toBe(false);
    expect(deps.focusSearch).not.toHaveBeenCalled();
  });

  it("returns false for commands whose feature is not built yet", () => {
    const deps = fakeDeps();
    for (const command of ["miniplayer", "updates", "import-backup", "export-backup"]) {
      expect(dispatchMenuCommand(command, deps)).toBe(false);
    }
    expect(anyCalled(deps)).toBe(false);
  });

  it("returns false and does nothing for an unknown command", () => {
    const deps = fakeDeps();
    expect(dispatchMenuCommand("format-disk", deps)).toBe(false);
    expect(anyCalled(deps)).toBe(false);
  });

  it("knows every command the native menu sends", () => {
    const sentByMenu = [
      "play-pause", "next", "previous", "shuffle", "repeat-off", "repeat-all", "repeat-one",
      "sleep-15", "sleep-30", "sleep-60", "sleep-end", "sleep-off", "queue", "lyrics",
      "now-playing", "miniplayer", "settings", "updates", "focus-search", "import-backup",
      "export-backup",
    ];
    for (const command of sentByMenu) {
      expect(isMenuCommand(command), command).toBe(true);
    }
    expect(MENU_COMMANDS).toContain("history-back");
  });
});

describe("historyCommand", () => {
  const base = { code: "", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };

  it("maps Cmd+[ and Cmd+] to back and forward", () => {
    expect(historyCommand({ ...base, code: "BracketLeft" })).toBe("history-back");
    expect(historyCommand({ ...base, code: "BracketRight" })).toBe("history-forward");
  });

  it("needs Cmd and no other modifier", () => {
    expect(historyCommand({ ...base, code: "BracketLeft", metaKey: false })).toBeNull();
    expect(historyCommand({ ...base, code: "BracketLeft", shiftKey: true })).toBeNull();
    expect(historyCommand({ ...base, code: "BracketLeft", altKey: true })).toBeNull();
    expect(historyCommand({ ...base, code: "BracketLeft", ctrlKey: true })).toBeNull();
  });

  it("ignores other keys", () => {
    expect(historyCommand({ ...base, code: "KeyF" })).toBeNull();
  });
});
