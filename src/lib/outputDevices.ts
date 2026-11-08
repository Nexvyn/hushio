export type RawDevice = Pick<MediaDeviceInfo, "kind" | "deviceId" | "groupId" | "label">;
export type OutputDevice = { deviceId: string; groupId: string; label: string };
export type OutputChoice = { deviceId: string; label: string; isDefault: boolean; activeDefault: boolean };
export type OutputSnapshot = {
  defaultGroup: string | undefined;
  selectedGroup: string | undefined;
  physicalGroups: string[];
};
export type OutputWatchDeps = {
  isPlaying: () => boolean;
  pinned: () => string;
  pause: () => void;
  unpin: () => void;
};

const RESERVED_IDS = new Set(["", "default", "communications"]);
let labelsUnlocked = false;

export function outputsOf(devices: readonly RawDevice[]): OutputDevice[] {
  let index = 0;
  return devices
    .filter((device) => device.kind === "audiooutput")
    .map((device) => {
      index += 1;
      return { deviceId: device.deviceId, groupId: device.groupId, label: device.label || `Speaker ${index}` };
    });
}

export async function readOutputDevices(): Promise<OutputDevice[]> {
  if (!navigator.mediaDevices) return [];
  return outputsOf(await navigator.mediaDevices.enumerateDevices());
}

export async function listOutputDevices(): Promise<OutputDevice[]> {
  if (!navigator.mediaDevices) return [];
  const raw = await navigator.mediaDevices.enumerateDevices();
  const unnamed = raw.some((device) => device.kind === "audiooutput" && (device.deviceId === "" || device.label === ""));
  if (labelsUnlocked || !unnamed) return outputsOf(raw);
  labelsUnlocked = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
  } catch (error) {
    console.warn(`[hushio] output labels stay hidden: ${String(error)}`);
  }
  return readOutputDevices();
}

export function deviceChoices(devices: readonly OutputDevice[]): OutputChoice[] {
  const defaultGroup = devices.find((device) => device.deviceId === "default")?.groupId;
  const seen = new Set<string>();
  const physical: OutputChoice[] = [];
  for (const device of devices) {
    if (RESERVED_IDS.has(device.deviceId)) continue;
    const key = device.groupId || device.deviceId;
    if (seen.has(key)) continue;
    seen.add(key);
    physical.push({
      deviceId: device.deviceId,
      label: device.label,
      isDefault: false,
      activeDefault: defaultGroup !== undefined && device.groupId === defaultGroup,
    });
  }
  return [{ deviceId: "", label: "System default", isDefault: true, activeDefault: true }, ...physical];
}

export function snapshotOutputs(devices: readonly OutputDevice[], sink: string): OutputSnapshot {
  const defaultGroup = devices.find((device) => device.deviceId === "default")?.groupId;
  const pinnedGroup = sink === "" ? undefined : devices.find((device) => device.deviceId === sink)?.groupId;
  return {
    defaultGroup,
    selectedGroup: sink === "" ? defaultGroup : pinnedGroup,
    physicalGroups: [...new Set(devices.filter((device) => device.deviceId !== "communications").map((device) => device.groupId))],
  };
}

export function outputChangeAction(
  prev: OutputSnapshot | null,
  next: OutputSnapshot,
  playing: boolean,
): "none" | "pause" {
  if (!playing || prev === null || prev.selectedGroup === undefined) return "none";
  return next.physicalGroups.includes(prev.selectedGroup) ? "none" : "pause";
}

export type AudioOutputState = { defaultId: string; deviceIds: string[] };

export function snapshotAudioOutput(state: AudioOutputState): OutputSnapshot {
  const defaultGroup = state.defaultId === "" ? undefined : state.defaultId;
  return { defaultGroup, selectedGroup: defaultGroup, physicalGroups: [...state.deviceIds] };
}

export function audioOutputWatch(deps: Pick<OutputWatchDeps, "isPlaying" | "pause">): (state: AudioOutputState) => void {
  let previous: OutputSnapshot | null = null;
  return (state) => {
    const next = snapshotAudioOutput(state);
    const action = outputChangeAction(previous, next, deps.isPlaying());
    previous = next;
    if (action === "pause") deps.pause();
  };
}

export function startOutputWatch(deps: OutputWatchDeps): void {
  if (!navigator.mediaDevices) return;
  let previous: OutputDevice[] | null = null;

  async function check(): Promise<void> {
    const devices = await readOutputDevices();
    const prev = previous === null ? null : snapshotOutputs(previous, deps.pinned());
    const next = snapshotOutputs(devices, deps.pinned());
    previous = devices;
    if (outputChangeAction(prev, next, deps.isPlaying()) === "pause") {
      deps.pause();
      if (deps.pinned() !== "") deps.unpin();
    }
  }

  void check();
  navigator.mediaDevices.addEventListener("devicechange", () => void check());
}
