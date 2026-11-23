import { describe, expect, it, vi, type Mock } from "vitest";
import { dispatchMenuCommand, historyCommand, isMenuCommand, MENU_COMMANDS, type MenuDeps } from "./menuCommands";
import { fs, SRC_DIR } from "./testFiles";

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
    toggleMiniplayer: vi.fn(),
    checkUpdates: vi.fn(),
    importBackup: vi.fn(),
    exportBackup: vi.fn(),
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
    ["miniplayer", "toggleMiniplayer"],
    ["updates", "checkUpdates"],
    ["import-backup", "importBackup"],
    ["export-backup", "exportBackup"],
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

describe("native menu wiring", () => {
  const menuRs = fs.readFileSync(`${SRC_DIR}../src-tauri/src/menu.rs`, "utf8");
  const bridgeTs = fs.readFileSync(`${SRC_DIR}lib/bridge.ts`, "utf8");

  it("only sends commands the frontend knows", () => {
    const sent = [...menuRs.matchAll(/\b(?:command|check)\("([a-z0-9-]+)"/g)].map((match) => match[1]);
    expect(sent.length).toBeGreaterThanOrEqual(21);
    for (const command of sent) {
      expect(MENU_COMMANDS, command).toContain(command);
    }
  });

  it("listens on the event name the Rust menu emits", () => {
    const rustEvent = menuRs.match(/pub const EVENT: &str = "([^"]+)"/)?.[1];
    expect(rustEvent).toBe("menu:command");
    expect(bridgeTs).toContain(`listen<string>("${rustEvent}"`);
  });
});
