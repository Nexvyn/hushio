export const EXCLUSIVE_UNAVAILABLE = "Exclusive output is not available on this device.";
export const EXCLUSIVE_VOLUME_NOTE = "Volume is controlled by your device in exclusive mode.";

export function exclusiveActive(setting: boolean, nativeAudio: boolean): boolean {
  return setting && nativeAudio;
}

export function appVolume(volume: number, exclusive: boolean): number {
  return exclusive ? 1 : volume;
}

export function levelGain(gain: number, exclusive: boolean): number {
  return exclusive ? 1 : gain;
}

export function eqForOutput<T extends { enabled: boolean }>(eq: T, exclusive: boolean): T {
  return exclusive ? { ...eq, enabled: false } : eq;
}

export function blendForOutput<T extends { crossfadeSeconds: number; smartFade: boolean }>(
  blend: T,
  exclusive: boolean,
): T {
  return exclusive ? { ...blend, crossfadeSeconds: 0, smartFade: false } : blend;
}
