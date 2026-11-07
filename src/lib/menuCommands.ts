export const MENU_COMMANDS = [
  "play-pause",
  "pause",
  "next",
  "previous",
  "shuffle",
  "repeat-off",
  "repeat-all",
  "repeat-one",
  "sleep-15",
  "sleep-30",
  "sleep-60",
  "sleep-end",
  "sleep-off",
  "queue",
  "lyrics",
  "now-playing",
  "miniplayer",
  "settings",
  "updates",
  "focus-search",
  "import-backup",
  "export-backup",
  "history-back",
  "history-forward",
] as const;

export type MenuCommand = (typeof MENU_COMMANDS)[number];

export type RepeatValue = "off" | "all" | "one";

export type MenuDeps = {
  toggle: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  toggleShuffle: () => void;
  setRepeat: (mode: RepeatValue) => void;
  sleep: (minutes: number) => void;
  sleepAtSongEnd: () => void;
  cancelSleep: () => void;
  toggleQueue: () => void;
  toggleLyrics: () => void;
  toggleNowPlaying: () => void;
  openSettings: () => void;
  focusSearch: () => void;
  goBack: () => void;
  goForward: () => void;
  layered: () => boolean;
};

const REPEAT_COMMANDS: Record<string, RepeatValue> = {
  "repeat-off": "off",
  "repeat-all": "all",
  "repeat-one": "one",
};

const SLEEP_COMMANDS: Record<string, number> = {
  "sleep-15": 15,
  "sleep-30": 30,
  "sleep-60": 60,
};

const NOT_BUILT = new Set<MenuCommand>(["miniplayer", "updates", "import-backup", "export-backup"]);

export function isMenuCommand(value: string): value is MenuCommand {
  return (MENU_COMMANDS as readonly string[]).includes(value);
}

export function dispatchMenuCommand(command: string, deps: MenuDeps): boolean {
  if (!isMenuCommand(command) || NOT_BUILT.has(command)) return false;
  if (command in REPEAT_COMMANDS) {
    deps.setRepeat(REPEAT_COMMANDS[command]);
    return true;
  }
  if (command in SLEEP_COMMANDS) {
    deps.sleep(SLEEP_COMMANDS[command]);
    return true;
  }
  switch (command) {
    case "play-pause":
      deps.toggle();
      return true;
    case "pause":
      deps.pause();
      return true;
    case "next":
      deps.next();
      return true;
    case "previous":
      deps.previous();
      return true;
    case "shuffle":
      deps.toggleShuffle();
      return true;
    case "sleep-end":
      deps.sleepAtSongEnd();
      return true;
    case "sleep-off":
      deps.cancelSleep();
      return true;
    case "queue":
      deps.toggleQueue();
      return true;
    case "lyrics":
      deps.toggleLyrics();
      return true;
    case "now-playing":
      deps.toggleNowPlaying();
      return true;
    case "settings":
      deps.openSettings();
      return true;
    case "focus-search":
      if (deps.layered()) return false;
      deps.focusSearch();
      return true;
    case "history-back":
      deps.goBack();
      return true;
    case "history-forward":
      deps.goForward();
      return true;
    default:
      return false;
  }
}

export function historyCommand(
  event: Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
): MenuCommand | null {
  if (!event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return null;
  if (event.code === "BracketLeft") return "history-back";
  if (event.code === "BracketRight") return "history-forward";
  return null;
}
