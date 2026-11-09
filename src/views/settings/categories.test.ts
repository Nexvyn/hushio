import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { buildCategories, type BuildContext, type RowSpec } from "./categories";
import { INITIAL_UPDATE_STATE } from "../../lib/updates";
import { useSettings } from "../../stores/settings";

function auth(mode: "guest" | "google" = "guest"): BuildContext["auth"] {
  return {
    account: { mode, googleSub: null, name: null, email: null, pictureUrl: null, configured: true, keyringAvailable: true },
    signingIn: false,
    signIn: vi.fn(),
    cancelSignIn: vi.fn(),
    requestSignOut: vi.fn(),
  };
}

function context(platform: BuildContext["platform"], mode: "guest" | "google" = "guest"): BuildContext {
  return {
    settings: useSettings.getState(),
    version: null,
    platform,
    navigate: vi.fn(),
    updates: { state: INITIAL_UPDATE_STATE, check: vi.fn(), install: vi.fn(), restart: vi.fn(), openPage: vi.fn() },
    auth: auth(mode),
    sync: { drive: { mode: "google" as const, lastSyncAt: null, restoreSeq: 0, restoredStores: [], state: "idle" as const, lastError: null, pending: 0 }, status: { state: "idle" as const, done: 0, total: 0, playlistName: null, backend: "official" as const, quotaUsedToday: 0, quotaLimit: 10000, failedJobs: 0, lastError: null, lastSyncedAt: null, pulledPlaylists: 0 }, syncNow: vi.fn(), tv: { connected: false, code: null, busy: false, error: null, connect: vi.fn(), cancel: vi.fn(), open: vi.fn(), disconnect: vi.fn() } },
  };
}

function soundRows(platform: BuildContext["platform"]): RowSpec[] {
  const sound = buildCategories(context(platform)).find((category) => category.id === "sound");
  expect(sound).toBeDefined();
  return sound?.groups.flatMap((group) => group.rows) ?? [];
}

function row(platform: BuildContext["platform"], id: string): RowSpec {
  const found = soundRows(platform).find((candidate) => candidate.id === id);
  expect(found).toBeDefined();
  if (found === undefined) throw new Error(`missing row ${id}`);
  return found;
}

const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
const node = () => ({
  connect: vi.fn(),
  frequency: param(),
  Q: param(),
  gain: param(),
  threshold: param(),
  knee: param(),
  ratio: param(),
  attack: param(),
  release: param(),
});

class FakeAudioContext {
  state = "running";
  sampleRate = 48000;
  currentTime = 0;
  destination = node();
  resume = vi.fn(async () => {});
  createMediaElementSource = vi.fn(() => node());
  createBiquadFilter = vi.fn(() => node());
  createGain = vi.fn(() => node());
  createDynamicsCompressor = vi.fn(() => node());
}

beforeEach(() => {
  vi.stubGlobal("AudioContext", FakeAudioContext);
  useSettings.setState({ audioSinkId: "", eqEnabled: false, eqAutoHeadroom: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Sound rows on Windows", () => {
  it("lists the output picker after volume leveling, then the equalizer and prevent clipping", () => {
    const titles = soundRows("windows").map((candidate) => candidate.title);
    expect(titles).toEqual([
      "Streaming quality",
      "Volume leveling",
      "Output device",
      "Equalizer",
      "Prevent clipping",
    ]);
  });

  it("shows the picker as the control and follows the system default when nothing is pinned", () => {
    const output = row("windows", "output-device");
    expect(output.control).toBeDefined();
    expect(output.note).toBe("Following the system default");
    expect(output.disabled).toBeFalsy();
  });

  it("says the output is pinned when a device is chosen", () => {
    useSettings.setState({ audioSinkId: "hdst" });
    expect(row("windows", "output-device").note).toBe("Pinned to this device");
  });

  it("attaches the equalizer editor below the equalizer switch", () => {
    const equalizer = soundRows("windows").find((candidate) => candidate.id === "equalizer");
    expect(equalizer?.toggle).toBeDefined();
    const group = buildCategories(context("windows"))
      .find((category) => category.id === "sound")
      ?.groups.find((candidate) => candidate.rows.some((item) => item.id === "equalizer"));
    expect(group?.body).toBeDefined();
  });

  it("turns Reduce transparency on through the Display row", () => {
    const display = buildCategories(context("windows")).find((category) => category.id === "display");
    const reduce = display?.groups.flatMap((group) => group.rows).find((candidate) => candidate.id === "reduce-transparency");
    expect(reduce?.toggle?.checked).toBe(false);
    reduce?.toggle?.onChange(true);
    expect(useSettings.getState().reduceDynamicBlur).toBe(true);
  });

  it("turns the equalizer on through the switch", () => {
    row("windows", "equalizer").toggle?.onChange(true);
    expect(useSettings.getState().eqEnabled).toBe(true);
  });

  it("disables prevent clipping while the equalizer is off and enables it when on", () => {
    expect(row("windows", "prevent-clipping").disabled).toBe(true);
    useSettings.setState({ eqEnabled: true });
    expect(row("windows", "prevent-clipping").disabled).toBe(false);
  });

  it("keeps the close to tray row for Windows only", () => {
    const playback = buildCategories(context("windows")).find((category) => category.id === "playback");
    expect(playback?.groups.flatMap((group) => group.rows).some((item) => item.id === "close-to-tray")).toBe(true);
  });
});

describe("Android rows", () => {
  const ids = (platform: BuildContext["platform"]) =>
    buildCategories(context(platform)).flatMap((category) => category.groups.flatMap((group) => group.rows.map((item) => item.id)));

  it("hides the desktop-only rows", () => {
    const hidden = ["close-to-tray", "output-device", "reduce-transparency", "hide-volume-bar", "download-folder", "export-downloads"];
    const present = ids("android");
    for (const id of hidden) expect(present).not.toContain(id);
    expect(ids("linux")).toEqual(expect.arrayContaining(["reduce-transparency", "hide-volume-bar", "download-folder"]));
  });

  it("shows crossfade and Automix as later and disabled", () => {
    for (const id of ["crossfade", "automix"]) {
      const found = soundOrPlayback("android", id);
      expect(found.note).toBe("Coming in a later version");
      expect(found.disabled).toBe(true);
      expect(found.control).toBeUndefined();
      expect(found.toggle).toBeUndefined();
    }
    expect(soundOrPlayback("linux", "automix").toggle).toBeDefined();
  });

  it("keeps the other playback rows active", () => {
    expect(soundOrPlayback("android", "autoplay").toggle).toBeDefined();
    expect(soundOrPlayback("android", "autoplay").disabled).toBeFalsy();
  });
});

function soundOrPlayback(platform: BuildContext["platform"], id: string): RowSpec {
  const all = buildCategories(context(platform)).flatMap((category) => category.groups.flatMap((group) => group.rows));
  const found = all.find((candidate) => candidate.id === id);
  expect(found).toBeDefined();
  if (found === undefined) throw new Error(`missing row ${id}`);
  return found;
}

describe("Sound rows off Windows", () => {
  it("shows the disabled output row on linux", () => {
    const platform = "linux";
    const output = row(platform, "output-device");
    expect(output.note).toBe("Follows the system output");
    expect(output.control).toBeUndefined();
    expect(output.toggle).toBeUndefined();
    expect(output.disabled).toBe(true);
  });

  it("hides the output picker on macOS and says the output follows the system", () => {
    const output = row("macos", "output-device");
    expect(output.note).toBe("Follows the system output");
    expect(output.control).toBeUndefined();
    expect(output.toggle).toBeUndefined();
    expect(output.disabled).toBeFalsy();
  });

  it("keeps the equalizer on Linux", () => {
    expect(row("linux", "equalizer").toggle).toBeDefined();
    expect(row("linux", "prevent-clipping").title).toBe("Prevent clipping");
  });
});
