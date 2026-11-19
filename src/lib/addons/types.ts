export class AddonError extends Error {}

export const ADDON_LIMIT = 10;
export const ADDON_MATCH_SECONDS = 3;
export const ADDON_QUALITY_KEY = "quality";
export const LOSSLESS = "lossless";
export const LOSSLESS_FORMATS: readonly string[] = ["flac", "alac", "wav", "aiff"];
export const ADDON_TEST_QUERY = "Let It Be The Beatles";

export type AddonSetting = { key: string; defaultValue: string | null; options: string[] };

export type AddonManifest = {
  id: string;
  name: string;
  version: string;
  resources: string[];
  settings: AddonSetting[];
};

export type AddonHealth = { ok: boolean; latencyMs: number; checkedAt: number; error: string | null };

export type AddonSource = {
  id: string;
  name: string;
  baseUrl: string;
  manifest: AddonManifest;
  enabled: boolean;
  priority: number;
  lastHealth: AddonHealth | null;
};

export type AddonTrack = { id: string; title: string; artist: string; durationSec: number | null; format: string };

export type AddonStream = { url: string; format: string; mime: string };

export type MatchTarget = { title: string; artist: string; durationSec: number | null };
