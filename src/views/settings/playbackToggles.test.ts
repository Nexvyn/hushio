import { beforeEach, describe, expect, it, vi } from "vitest";
import { fs, SRC_DIR } from "../../lib/testFiles";

vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { buildCategories, type BuildContext, type RowSpec } from "./categories";
import { INITIAL_UPDATE_STATE } from "../../lib/updates";
import { useSettings, type SettingsValues } from "../../stores/settings";

const idle = {
  state: "idle" as const,
  done: 0,
  total: 0,
  playlistName: null,
  backend: "official" as const,
  quotaUsedToday: 0,
  quotaLimit: 10000,
  failedJobs: 0,
  lastError: null,
  lastSyncedAt: null,
  pulledPlaylists: 0,
};

function context(platform: BuildContext["platform"]): BuildContext {
  return {
    settings: useSettings.getState(),
    version: null,
    platform,
    navigate: vi.fn(),
    updates: { state: INITIAL_UPDATE_STATE, check: vi.fn(), install: vi.fn(), restart: vi.fn(), openPage: vi.fn() },
    auth: {
      account: { mode: "guest", googleSub: null, name: null, email: null, pictureUrl: null, configured: true, keyringAvailable: true, reconnect: false },
      signingIn: false,
      signIn: vi.fn(),
      cancelSignIn: vi.fn(),
      requestSignOut: vi.fn(),
    },
    sync: {
      status: { ...idle, state: "idle" as const },
      syncNow: vi.fn(),
      tv: { connected: false, code: null, busy: false, error: null, connect: vi.fn(), cancel: vi.fn(), open: vi.fn(), disconnect: vi.fn() },
    },
  };
}

function playbackToggles(platform: BuildContext["platform"]): RowSpec[] {
  const playback = buildCategories(context(platform)).find((category) => category.id === "playback");
  return (playback?.groups.flatMap((group) => group.rows) ?? []).filter((row) => row.toggle !== undefined);
}

type ToggleCase = { id: string; key: keyof SettingsValues; reader: string; platform: BuildContext["platform"] };

const CASES: ToggleCase[] = [
  { id: "automix", key: "smartFade", reader: "lib/audio.ts", platform: "windows" },
  { id: "gapless", key: "gaplessPlayback", reader: "lib/audio.ts", platform: "windows" },
  { id: "skip-silence", key: "skipSilence", reader: "lib/audio.ts", platform: "windows" },
  { id: "jiosaavn-catalogue", key: "jiosaavnEnabled", reader: "lib/jiosaavn.ts", platform: "windows" },
  { id: "autoplay", key: "autoplay", reader: "stores/player.ts", platform: "windows" },
  { id: "no-repeat-suggestions", key: "dontRepeatSuggestions", reader: "lib/useHomeFeed.ts", platform: "windows" },
  { id: "no-duplicate-queue", key: "noDuplicateQueue", reader: "stores/player.ts", platform: "windows" },
  { id: "restore-queue", key: "restoreQueueOnRestart", reader: "stores/player.ts", platform: "windows" },
  { id: "close-to-tray", key: "closeToTray", reader: "../src-tauri/src/window.rs", platform: "windows" },
  { id: "stats-for-nerds", key: "statsForNerds", reader: "components/NowPlaying.tsx", platform: "windows" },
];

const initialSettings = useSettings.getState();

describe("Playback toggles", () => {
  beforeEach(() => {
    useSettings.setState(initialSettings, true);
  });

  it("lists exactly the toggles covered by these tests", () => {
    expect(playbackToggles("windows").map((row) => row.id).sort()).toEqual(CASES.map((item) => item.id).sort());
  });

  it.each(CASES)("$id flips $key in the store the player reads", ({ id, key, platform }) => {
    const row = playbackToggles(platform).find((candidate) => candidate.id === id);
    expect(row?.toggle).toBeDefined();
    const before = useSettings.getState()[key] as boolean;
    row?.toggle?.onChange(!before);
    expect(useSettings.getState()[key]).toBe(!before);
    row?.toggle?.onChange(before);
    expect(useSettings.getState()[key]).toBe(before);
  });

  it.each(CASES)("$id is read from its consumer, $reader", ({ key, reader }) => {
    expect(fs.readFileSync(`${SRC_DIR}${reader}`, "utf8")).toContain(key);
  });
});
