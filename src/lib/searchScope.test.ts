import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchAddon } = vi.hoisted(() => ({ searchAddon: vi.fn() }));

vi.mock("./addons/client", () => ({ searchAddon }));

import type { AddonSource, AddonTrack } from "./addons/types";
import type { LocalTrack } from "./bridge";
import { addonsAvailable, deviceSongs, isAddonTrackId, searchAddons } from "./searchScope";

function source(id: string, enabled = true): AddonSource {
  return {
    id,
    name: id,
    baseUrl: `https://${id}.example`,
    manifest: { id, name: id, version: "1", resources: [], settings: [] },
    enabled,
    priority: 0,
    lastHealth: null,
  };
}

function localTrack(id: string, title: string, artist: string, album: string): LocalTrack {
  return { id: `local:${id}`, path: `/music/${id}.mp3`, title, artist, album, duration: 200, size: 1, mtime: 1 };
}

function addonTrack(id: string, title: string, artist = "Band"): AddonTrack {
  return { id, title, artist, durationSec: 180, format: "flac" };
}

beforeEach(() => {
  searchAddon.mockReset();
});

describe("on-device search", () => {
  const tracks = [
    localTrack("1", "Blue Hour", "Nova", "Night Air"),
    localTrack("2", "Red Sun", "Ember", "Daybreak"),
    localTrack("3", "Quiet", "NOVA Ensemble", "Stillness"),
  ];

  it("matches title, artist and album without regard to case", () => {
    expect(deviceSongs(tracks, "nova").map((song) => song.id)).toEqual(["local:1", "local:3"]);
    expect(deviceSongs(tracks, "DAYBREAK").map((song) => song.id)).toEqual(["local:2"]);
    expect(deviceSongs(tracks, "blue h").map((song) => song.id)).toEqual(["local:1"]);
  });

  it("returns every local song for a blank query", () => {
    expect(deviceSongs(tracks, "   ")).toHaveLength(3);
  });

  it("maps album and duration onto the song", () => {
    expect(deviceSongs(tracks, "red sun")[0]).toMatchObject({ album: "Daybreak", duration: 200, thumb: null });
  });
});

describe("add-on search", () => {
  it("is available only while an add-on source is enabled", () => {
    expect(addonsAvailable([])).toBe(false);
    expect(addonsAvailable([source("off", false)])).toBe(false);
    expect(addonsAvailable([source("off", false), source("on")])).toBe(true);
  });

  it("marks add-on song ids so the menu can hide links for them", () => {
    expect(isAddonTrackId("addon:one:abc")).toBe(true);
    expect(isAddonTrackId("v1")).toBe(false);
    expect(isAddonTrackId("local:1")).toBe(false);
  });

  it("returns nothing and asks no add-on for a blank query", async () => {
    await expect(searchAddons([source("one")], "  ")).resolves.toEqual([]);
    expect(searchAddon).not.toHaveBeenCalled();
  });

  it("searches only the enabled sources and merges their songs", async () => {
    searchAddon.mockImplementation(async (ref: { baseUrl: string }) =>
      ref.baseUrl.includes("one") ? [addonTrack("a", "Song A")] : [addonTrack("b", "Song B", "Other")],
    );

    const songs = await searchAddons([source("one"), source("two"), source("off", false)], "song");

    expect(searchAddon).toHaveBeenCalledTimes(2);
    expect(songs.map((song) => [song.id, song.title, song.artist, song.duration])).toEqual([
      ["addon:one:a", "Song A", "Band", 180],
      ["addon:two:b", "Song B", "Other", 180],
    ]);
  });

  it("keeps the songs of the sources that answered when one fails", async () => {
    searchAddon.mockImplementation(async (ref: { baseUrl: string }) => {
      if (ref.baseUrl.includes("broken")) throw new Error("timeout");
      return [addonTrack("a", "Song A")];
    });

    const songs = await searchAddons([source("broken"), source("fine")], "song");

    expect(songs.map((song) => song.id)).toEqual(["addon:fine:a"]);
  });

  it("reports failure when every enabled add-on fails", async () => {
    searchAddon.mockRejectedValue(new Error("timeout"));

    await expect(searchAddons([source("one"), source("two")], "song")).rejects.toThrow("Every add-on search failed");
  });
});
