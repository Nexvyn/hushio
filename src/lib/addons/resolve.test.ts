import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import { fetch } from "@tauri-apps/plugin-http";
import { addonTrackStream, matchAddonTrack, resolveAddonStream } from "./resolve";
import { sourceFromManifest, validateManifest } from "./registry";
import type { AddonSource, AddonTrack } from "./types";

const fetchMock = vi.mocked(fetch);

const target = { title: "Song Name", artist: "The Band", durationSec: 200 };

const track = (overrides: Partial<AddonTrack> = {}): AddonTrack => ({
  id: "t1",
  title: "Song Name",
  artist: "The Band",
  durationSec: 201,
  format: "flac",
  ...overrides,
});

function addon(name: string, priority: number, enabled = true): AddonSource {
  const manifest = validateManifest({
    id: name,
    name,
    resources: ["search", "stream"],
    settings: [{ key: "quality", default: "lossless", options: ["lossless"] }],
  });
  return { ...sourceFromManifest(`https://${name}.example`, manifest), priority, enabled };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("matchAddonTrack", () => {
  it("matches on normalised title and artist within three seconds", () => {
    const found = matchAddonTrack(target, [track({ id: "wrong", title: "Other" }), track({ id: "right" })]);
    expect(found?.id).toBe("right");
  });

  it("ignores remaster and bracket noise in the title", () => {
    const found = matchAddonTrack(target, [track({ title: "Song Name (Remastered 2011)" })]);
    expect(found).not.toBeNull();
  });

  it("rejects a candidate more than three seconds away", () => {
    expect(matchAddonTrack(target, [track({ durationSec: 204 })])).toBeNull();
    expect(matchAddonTrack(target, [track({ durationSec: 203 })])).not.toBeNull();
  });

  it("does not reject on duration when either side has none", () => {
    expect(matchAddonTrack({ ...target, durationSec: null }, [track({ durationSec: 500 })])).not.toBeNull();
    expect(matchAddonTrack(target, [track({ durationSec: null })])).not.toBeNull();
  });

  it("accepts a credited artist list that contains the artist as whole words", () => {
    expect(matchAddonTrack(target, [track({ artist: "The Band, Guest" })])).not.toBeNull();
    expect(matchAddonTrack(target, [track({ artist: "Theband" })])).toBeNull();
  });
});

describe("addonTrackStream", () => {
  it("plays a search result by its source and track id, whatever the quality", async () => {
    fetchMock.mockResolvedValueOnce(json({ url: "https://cdn.example/t.mp3", format: "mp3" }));
    const result = await addonTrackStream("addon:alpha:a/42", [addon("alpha", 0)]);
    expect(result).toEqual({
      stream: { url: "https://cdn.example/t.mp3", mime: "audio/mpeg", lufs: null },
      label: "Add-on: alpha",
    });
    expect(fetchMock.mock.calls[0][0]).toContain("/stream/a%2F42");
  });

  it("returns null for a YouTube id or a disabled add-on without calling the network", async () => {
    expect(await addonTrackStream("dQw4w9WgXcQ", [addon("alpha", 0)])).toBeNull();
    expect(await addonTrackStream("addon:alpha:42", [addon("alpha", 0, false)])).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resolveAddonStream", () => {
  it("does nothing unless the requested quality is lossless", async () => {
    expect(await resolveAddonStream(target, [addon("a", 0)], false)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when no add-on is enabled", async () => {
    expect(await resolveAddonStream(target, [addon("a", 0, false)], true)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the matched FLAC stream labelled with the add-on", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ tracks: [track({ id: "42" })] }))
      .mockResolvedValueOnce(json({ url: "https://cdn.example/s.flac", format: "flac" }));
    const result = await resolveAddonStream(target, [addon("alpha", 0)], true);
    expect(result).toEqual({
      stream: { url: "https://cdn.example/s.flac", mime: "audio/flac", lufs: null },
      label: "Add-on: alpha",
    });
    expect(fetchMock.mock.calls[1][0]).toContain("/stream/42");
  });

  it("falls back to null when the add-on fails, without throwing", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    expect(await resolveAddonStream(target, [addon("alpha", 0)], true)).toBeNull();
  });

  it("falls back when the add-on has no matching track", async () => {
    fetchMock.mockResolvedValueOnce(json({ tracks: [track({ title: "Different" })] }));
    expect(await resolveAddonStream(target, [addon("alpha", 0)], true)).toBeNull();
  });

  it("skips a stream that is not lossless", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ tracks: [track()] }))
      .mockResolvedValueOnce(json({ url: "https://cdn.example/s.mp3", format: "mp3" }));
    expect(await resolveAddonStream(target, [addon("alpha", 0)], true)).toBeNull();
  });

  it("tries add-ons in priority order and moves on past a failing one", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("down"))
      .mockResolvedValueOnce(json({ tracks: [track({ id: "9" })] }))
      .mockResolvedValueOnce(json({ url: "https://cdn.example/b.flac", format: "flac" }));
    const sources = [addon("second", 1), addon("first", 0)];
    const result = await resolveAddonStream(target, sources, true);
    expect(result?.label).toBe("Add-on: second");
    expect(fetchMock.mock.calls[0][0]).toContain("first.example");
    expect(fetchMock.mock.calls[1][0]).toContain("second.example");
  });

  it("ignores a disabled add-on even when it would match", async () => {
    fetchMock.mockResolvedValueOnce(json({ tracks: [track()] })).mockResolvedValueOnce(json({ url: "https://cdn.example/x.flac", format: "flac" }));
    const sources = [addon("off", 0, false), addon("on", 1)];
    const result = await resolveAddonStream(target, sources, true);
    expect(result?.label).toBe("Add-on: on");
    expect(fetchMock.mock.calls[0][0]).toContain("on.example");
  });
});
