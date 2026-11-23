import { afterEach, describe, expect, it, vi } from "vitest";
import {
  audioOutputWatch,
  deviceChoices,
  type OutputDevice,
  outputChangeAction,
  outputsOf,
  type RawDevice,
  readOutputDevices,
  snapshotAudioOutput,
  snapshotOutputs,
  startOutputWatch,
} from "./outputDevices";

const { invoke, isTauri } = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(() => false) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri }));

function raw(deviceId: string, groupId: string, label: string, kind: MediaDeviceKind = "audiooutput"): RawDevice {
  return { kind, deviceId, groupId, label };
}

const SPEAKERS: OutputDevice = { deviceId: "spk", groupId: "g-spk", label: "Speakers" };
const HEADSET: OutputDevice = { deviceId: "hdst", groupId: "g-hdst", label: "Headset" };
const DEFAULT_ON_HEADSET: OutputDevice = { deviceId: "default", groupId: "g-hdst", label: "Default - Headset" };
const COMMS: OutputDevice = { deviceId: "communications", groupId: "g-hdst", label: "Communications" };

const ALL: OutputDevice[] = [DEFAULT_ON_HEADSET, COMMS, SPEAKERS, HEADSET];

type MediaMock = {
  enumerateDevices: ReturnType<typeof vi.fn>;
  getUserMedia: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

function stubMediaDevices(list: RawDevice[][]): MediaMock {
  const media: MediaMock = {
    enumerateDevices: vi.fn(async () => list.shift() ?? []),
    getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(navigator, "mediaDevices", { value: media, configurable: true, writable: true });
  return media;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "mediaDevices");
  vi.resetModules();
});

describe("labels", () => {
  it("names unlabelled outputs Speaker N by their place in the list", () => {
    const names = outputsOf([raw("", "", ""), raw("mic", "g", "Mic", "audioinput"), raw("x", "g2", "Named")]);
    expect(names).toEqual([
      { deviceId: "", groupId: "", label: "Speaker 1" },
      { deviceId: "x", groupId: "g2", label: "Named" },
    ]);
  });
});

describe("listing", () => {
  it("returns nothing when the page has no media devices", async () => {
    const { listOutputDevices, readOutputDevices } = await import("./outputDevices");
    expect(await listOutputDevices()).toEqual([]);
    expect(await readOutputDevices()).toEqual([]);
  });

  it("asks for a microphone grant once to reveal output labels, then lists the named devices", async () => {
    const media = stubMediaDevices([
      [raw("", "g1", "")],
      [raw("spk", "g1", "Speakers")],
    ]);
    const { listOutputDevices } = await import("./outputDevices");

    const first = await listOutputDevices();

    expect(media.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(first).toEqual([{ deviceId: "spk", groupId: "g1", label: "Speakers" }]);

    media.enumerateDevices.mockResolvedValueOnce([raw("", "g1", "")]);
    await listOutputDevices();
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("keeps Speaker N names when the label grant is refused", async () => {
    const media = stubMediaDevices([[raw("", "g1", "")], [raw("", "g1", "")]]);
    media.getUserMedia.mockRejectedValueOnce(new Error("NotAllowedError"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { listOutputDevices } = await import("./outputDevices");

    const list = await listOutputDevices();

    expect(list[0].label).toBe("Speaker 1");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("desktop listing", () => {
  it("falls back to the browser device list when mpv cannot list devices", async () => {
    isTauri.mockReturnValue(true);
    invoke.mockRejectedValueOnce(new Error("mpv is missing"));
    stubMediaDevices([[raw("spk", "g-spk", "Speakers")]]);

    const devices = await readOutputDevices();

    expect(devices).toEqual([{ deviceId: "spk", groupId: "g-spk", label: "Speakers" }]);
    isTauri.mockReturnValue(false);
  });
});

describe("choices", () => {
  it("starts with System default and marks the endpoint the default route resolves to", () => {
    const choices = deviceChoices(ALL);
    expect(choices[0]).toEqual({ deviceId: "", label: "System default", isDefault: true, activeDefault: true });
    expect(choices.slice(1).map((choice) => [choice.deviceId, choice.activeDefault])).toEqual([
      ["spk", false],
      ["hdst", true],
    ]);
  });

  it("skips the default and communications entries and dedupes endpoints by group", () => {
    const duplicate: OutputDevice = { deviceId: "spk-2", groupId: "g-spk", label: "Speakers again" };
    const choices = deviceChoices([...ALL, duplicate]);
    expect(choices.map((choice) => choice.deviceId)).toEqual(["", "spk", "hdst"]);
  });

  it("does not mark anything as the default route when no default entry exists", () => {
    const choices = deviceChoices([SPEAKERS]);
    expect(choices[1].activeDefault).toBe(false);
  });
});

describe("snapshots and actions", () => {
  it("follows the default group when no device is pinned", () => {
    expect(snapshotOutputs(ALL, "")).toEqual({
      defaultGroup: "g-hdst",
      selectedGroup: "g-hdst",
      physicalGroups: ["g-hdst", "g-spk"],
    });
  });

  it("uses the pinned device group when one is pinned", () => {
    expect(snapshotOutputs(ALL, "spk").selectedGroup).toBe("g-spk");
  });

  it("does nothing when playback is stopped", () => {
    const before = snapshotOutputs(ALL, "");
    const after = snapshotOutputs([SPEAKERS], "");
    expect(outputChangeAction(before, after, false)).toBe("none");
  });

  it("does nothing on the first snapshot", () => {
    expect(outputChangeAction(null, snapshotOutputs(ALL, ""), true)).toBe("none");
  });

  it("pauses when the heard endpoint is gone", () => {
    const before = snapshotOutputs(ALL, "");
    const after = snapshotOutputs([SPEAKERS, { ...SPEAKERS, deviceId: "x" }], "");
    expect(outputChangeAction(before, after, true)).toBe("pause");
  });

  it("keeps playing when the default changes but the heard endpoint is still there", () => {
    const before = snapshotOutputs(ALL, "");
    const moved = [SPEAKERS, HEADSET, { deviceId: "default", groupId: "g-spk", label: "Default - Speakers" }];
    expect(outputChangeAction(before, snapshotOutputs(moved, ""), true)).toBe("none");
  });

  it("pauses when the pinned device is unplugged", () => {
    const before = snapshotOutputs(ALL, "spk");
    expect(outputChangeAction(before, snapshotOutputs([HEADSET], "spk"), true)).toBe("pause");
  });
});

describe("startOutputWatch", () => {
  function startWith(list: RawDevice[][], playing: boolean, pinned: string) {
    const media = stubMediaDevices(list);
    const deps = {
      isPlaying: vi.fn(() => playing),
      pinned: vi.fn(() => pinned),
      pause: vi.fn(),
      unpin: vi.fn(),
    };
    startOutputWatch(deps);
    const onChange = media.addEventListener.mock.calls[0][1] as () => void;
    return { deps, onChange };
  }

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const BEFORE = [
    raw("default", "g-hdst", "Default"),
    raw("spk", "g-spk", "Speakers"),
    raw("hdst", "g-hdst", "Headset"),
  ];
  const AFTER_UNPLUG = [raw("default", "g-spk", "Default"), raw("spk", "g-spk", "Speakers")];

  it("pauses and does not resume when the heard headset is unplugged", async () => {
    const { deps, onChange } = startWith([BEFORE, AFTER_UNPLUG], true, "");
    await settle();

    onChange();
    await settle();

    expect(deps.pause).toHaveBeenCalledTimes(1);
    expect(deps.unpin).not.toHaveBeenCalled();
  });

  it("unpins a pinned device that disappears, so the next start follows the system", async () => {
    const { deps, onChange } = startWith([BEFORE, [raw("default", "g-spk", "Default"), raw("spk", "g-spk", "Speakers")]], true, "hdst");
    await settle();

    onChange();
    await settle();

    expect(deps.pause).toHaveBeenCalledTimes(1);
    expect(deps.unpin).toHaveBeenCalledTimes(1);
  });

  it("does not pause while nothing is playing", async () => {
    const { deps, onChange } = startWith([BEFORE, AFTER_UNPLUG], false, "");
    await settle();

    onChange();
    await settle();

    expect(deps.pause).not.toHaveBeenCalled();
  });

  it("does not pause when a device is added", async () => {
    const { deps, onChange } = startWith([BEFORE, [...BEFORE, raw("usb", "g-usb", "USB")]], true, "");
    await settle();

    onChange();
    await settle();

    expect(deps.pause).not.toHaveBeenCalled();
  });

  it("does not pause when an unused HDMI output is unplugged", async () => {
    const hdmi = raw("hdmi", "g-hdmi", "HDMI Output");
    const { deps, onChange } = startWith([[raw("spk", "g-spk", "Speakers"), raw("hdst", "g-hdst", "Monitor"), hdmi], [raw("spk", "g-spk", "Speakers"), raw("hdst", "g-hdst", "Monitor")]], true, "");
    await settle();

    onChange();
    await settle();

    expect(deps.pause).not.toHaveBeenCalled();
  });

  it("pauses when the device plugged in most recently is unplugged", async () => {
    const dock = raw("dock", "g-dock", "Wireless Dock");
    const base = [raw("spk", "g-spk", "Speakers"), raw("hdmi", "g-hdmi", "HDMI Output")];
    const { deps, onChange } = startWith([base, [...base, dock], base], true, "");
    await settle();

    onChange();
    await settle();
    onChange();
    await settle();

    expect(deps.pause).toHaveBeenCalledTimes(1);
  });

  it("pauses when a Headphones output is unplugged", async () => {
    const base = [raw("spk", "g-spk", "Speakers"), raw("hp", "g-hp", "Headphones"), raw("hdmi", "g-hdmi", "HDMI Output")];
    const { deps, onChange } = startWith([base, [raw("spk", "g-spk", "Speakers"), raw("hdmi", "g-hdmi", "HDMI Output")]], true, "");
    await settle();

    onChange();
    await settle();

    expect(deps.pause).toHaveBeenCalledTimes(1);
  });

  it("pauses on desktop when the system default route is unplugged and no default entry exists", async () => {
    const withoutDefault = [raw("spk", "g-spk", "Speakers"), raw("hdst", "g-hdst", "Headset")];
    const { deps, onChange } = startWith([withoutDefault, [raw("spk", "g-spk", "Speakers")]], true, "");
    await settle();

    onChange();
    await settle();

    expect(deps.pause).toHaveBeenCalledTimes(1);
  });

  it("does nothing without media devices", async () => {
    const { startOutputWatch: start } = await import("./outputDevices");
    const deps = { isPlaying: () => true, pinned: () => "", pause: vi.fn(), unpin: vi.fn() };
    start(deps);
    await settle();
    expect(deps.pause).not.toHaveBeenCalled();
  });
});

describe("macOS audio output watch", () => {
  const SPEAKERS = { defaultId: "uid-spk", deviceIds: ["uid-spk", "uid-hp"] };
  const HEADPHONES = { defaultId: "uid-hp", deviceIds: ["uid-spk", "uid-hp"] };

  it("follows the system default and uses device UIDs as the groups", () => {
    expect(snapshotAudioOutput(SPEAKERS)).toEqual({
      defaultGroup: "uid-spk",
      selectedGroup: "uid-spk",
      physicalGroups: ["uid-spk", "uid-hp"],
    });
  });

  it("does not pause on the first state", () => {
    const pause = vi.fn();
    const onState = audioOutputWatch({ isPlaying: () => true, pause });
    onState(SPEAKERS);
    expect(pause).not.toHaveBeenCalled();
  });

  it("pauses once when the heard device disappears", () => {
    const pause = vi.fn();
    const onState = audioOutputWatch({ isPlaying: () => true, pause });
    onState(SPEAKERS);
    onState({ defaultId: "uid-hp", deviceIds: ["uid-hp"] });
    onState({ defaultId: "uid-hp", deviceIds: ["uid-hp"] });
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it("keeps playing when the default moves to a device that was just plugged in", () => {
    const pause = vi.fn();
    const onState = audioOutputWatch({ isPlaying: () => true, pause });
    onState(SPEAKERS);
    onState(HEADPHONES);
    expect(pause).not.toHaveBeenCalled();
  });

  it("does not pause while stopped", () => {
    const pause = vi.fn();
    const onState = audioOutputWatch({ isPlaying: () => false, pause });
    onState(SPEAKERS);
    onState({ defaultId: "uid-spk", deviceIds: ["uid-spk"] });
    expect(pause).not.toHaveBeenCalled();
  });

  it("treats an empty default id as an unknown heard device", () => {
    const pause = vi.fn();
    const onState = audioOutputWatch({ isPlaying: () => true, pause });
    onState({ defaultId: "", deviceIds: [] });
    onState({ defaultId: "", deviceIds: ["uid-spk"] });
    expect(pause).not.toHaveBeenCalled();
  });
});
