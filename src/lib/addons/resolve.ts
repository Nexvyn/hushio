import { normalizeTitle } from "../normalizeTitle";
import type { ResolvedStream } from "../resolveStream";
import { useSettings } from "../../stores/settings";
import { searchAddon, streamAddon } from "./client";
import { enabledAddons } from "./registry";
import {
  ADDON_MATCH_SECONDS,
  LOSSLESS_FORMATS,
  type AddonSource,
  type AddonTrack,
  type MatchTarget,
} from "./types";

const RESOLVE_BUDGET_MS = 6_000;

export type AddonResolution = { stream: ResolvedStream; label: `Add-on: ${string}` };

function inWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

export function matchAddonTrack(target: MatchTarget, candidates: readonly AddonTrack[]): AddonTrack | null {
  const title = normalizeTitle(target.title);
  const artist = normalizeTitle(target.artist);
  if (!title || !artist) return null;
  return (
    candidates.find((candidate) => {
      if (normalizeTitle(candidate.title) !== title) return false;
      const candidateArtist = normalizeTitle(candidate.artist);
      if (!candidateArtist) return false;
      const sameArtist = candidateArtist === artist || inWords(candidateArtist, artist) || inWords(artist, candidateArtist);
      if (!sameArtist) return false;
      if (target.durationSec === null || candidate.durationSec === null) return true;
      return Math.abs(candidate.durationSec - target.durationSec) <= ADDON_MATCH_SECONDS;
    }) ?? null
  );
}

export async function resolveAddonStream(
  target: MatchTarget,
  sources: readonly AddonSource[],
  lossless: boolean,
): Promise<AddonResolution | null> {
  if (!lossless) return null;
  const deadline = Date.now() + RESOLVE_BUDGET_MS;
  for (const source of enabledAddons(sources)) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    try {
      const candidates = await searchAddon(source, `${target.artist} ${target.title}`, left);
      const match = matchAddonTrack(target, candidates);
      if (!match) continue;
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const stream = await streamAddon(source, match.id, remaining);
      if (!LOSSLESS_FORMATS.includes(stream.format)) continue;
      return {
        stream: { url: stream.url, mime: stream.mime, lufs: null },
        label: `Add-on: ${source.name}`,
      };
    } catch (error) {
      console.warn(`[hushio] add-on ${source.name} skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return null;
}

export function addonsEnabled(lossless: boolean): boolean {
  if (!lossless) return false;
  return enabledAddons(useSettings.getState().addonSources ?? []).length > 0;
}

export async function addonTrackStream(id: string, sources: readonly AddonSource[]): Promise<AddonResolution | null> {
  const [prefix, sourceId, ...rest] = id.split(":");
  const source = enabledAddons(sources).find((item) => item.id === sourceId);
  if (prefix !== "addon" || !source) return null;
  const stream = await streamAddon(source, rest.join(":"));
  return { stream: { url: stream.url, mime: stream.mime, lufs: null }, label: `Add-on: ${source.name}` };
}

export async function addonStreamFor(id: string, lossless: boolean): Promise<AddonResolution | null> {
  try {
    if (id.startsWith("addon:")) return await addonTrackStream(id, useSettings.getState().addonSources ?? []);
    if (!addonsEnabled(lossless)) return null;
    const { usePlayer } = await import("../../stores/player");
    const track = usePlayer.getState().queue.find((item) => item.id === id);
    if (!track || track.episode) return null;
    return await resolveAddonStream(
      { title: track.title, artist: track.artist, durationSec: track.duration ?? null },
      useSettings.getState().addonSources,
      true,
    );
  } catch {
    return null;
  }
}
