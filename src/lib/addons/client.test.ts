import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));

import { fetch } from "@tauri-apps/plugin-http";
import { fetchManifest, qualityFor, searchAddon, streamAddon, testAddon } from "./client";
import type { AddonManifest } from "./types";

const fetchMock = vi.mocked(fetch);

const MANIFEST = {
  id: "flac-addon",
  name: "Flac Add-on",
  version: "1.0.0",
  resources: ["search", "stream"],
  settings: [{ key: "quality", default: "high", options: ["high", "lossless"] }],
};

const ADDON = {
  baseUrl: "https://addon.example",
  manifest: {
    id: "flac-addon",
    name: "Flac Add-on",
    version: "1.0.0",
    resources: ["search", "stream"],
    settings: [{ key: "quality", defaultValue: "high", options: ["high", "lossless"] }],
  } satisfies AddonManifest,
};

function reply(body: unknown, init: { status?: number; contentLength?: number } = {}): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = {};
  if (init.contentLength !== undefined) headers["content-length"] = String(init.contentLength);
  return new Response(text, { status: init.status ?? 200, headers });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("fetchManifest", () => {
  it("reads and validates the manifest over the app's HTTP path", async () => {
    fetchMock.mockResolvedValueOnce(reply(MANIFEST));
    const manifest = await fetchManifest("https://addon.example");
    expect(manifest.id).toBe("flac-addon");
    expect(fetchMock.mock.calls[0][0]).toBe("https://addon.example/manifest.json");
  });

  it("explains a 404 as no add-on at that address", async () => {
    fetchMock.mockResolvedValueOnce(reply("nope", { status: 404 }));
    await expect(fetchManifest("https://addon.example")).rejects.toThrow("No add-on answers");
  });

  it("refuses an oversize response by its declared length", async () => {
    fetchMock.mockResolvedValueOnce(reply(MANIFEST, { contentLength: 10 * 1024 * 1024 }));
    await expect(fetchManifest("https://addon.example")).rejects.toThrow("too much data");
  });

  it("refuses an oversize body even without a declared length", async () => {
    fetchMock.mockResolvedValueOnce(reply("x".repeat(70 * 1024)));
    await expect(fetchManifest("https://addon.example")).rejects.toThrow("too much data");
  });

  it("rejects a manifest that fails validation", async () => {
    fetchMock.mockResolvedValueOnce(reply({ ...MANIFEST, resources: ["search"] }));
    await expect(fetchManifest("https://addon.example")).rejects.toThrow("search and stream");
  });

  it("rejects a body that is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(reply("<html>"));
    await expect(fetchManifest("https://addon.example")).rejects.toThrow("did not send JSON");
  });

  it("reports an unreachable host as a plain failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    await expect(fetchManifest("https://addon.example")).rejects.toThrow("Could not reach the add-on");
  });
});

describe("qualityFor", () => {
  it("asks for lossless when the add-on lists it and the first option otherwise", () => {
    expect(qualityFor(ADDON.manifest)).toBe("lossless");
    const listed = { ...ADDON.manifest, settings: [{ key: "quality", defaultValue: null, options: ["hi", "mid"] }] };
    expect(qualityFor(listed)).toBe("hi");
    expect(qualityFor({ ...ADDON.manifest, settings: [] })).toBe("lossless");
  });
});

describe("searchAddon", () => {
  it("sends the query and quality, and keeps only well-formed tracks", async () => {
    fetchMock.mockResolvedValueOnce(
      reply({
        tracks: [
          { id: "1", title: "Song", artist: "Band", duration: 201.4, format: "FLAC" },
          { id: "", title: "No id" },
          { id: "2", title: "" },
          "junk",
        ],
      }),
    );
    const tracks = await searchAddon(ADDON, "Band Song");
    expect(fetchMock.mock.calls[0][0]).toBe("https://addon.example/search?q=Band%20Song&quality=lossless");
    expect(tracks).toEqual([{ id: "1", title: "Song", artist: "Band", durationSec: 201.4, format: "flac" }]);
  });

  it("treats a missing tracks list as a failure rather than no results", async () => {
    fetchMock.mockResolvedValueOnce(reply({ items: [] }));
    await expect(searchAddon(ADDON, "x")).rejects.toThrow("no tracks list");
  });
});

describe("streamAddon", () => {
  it("returns a lossless FLAC stream with its mime type", async () => {
    fetchMock.mockResolvedValueOnce(reply({ url: "https://cdn.example/a.flac", format: "flac" }));
    const stream = await streamAddon(ADDON, "track/7", 4000);
    expect(fetchMock.mock.calls[0][0]).toBe("https://addon.example/stream/track%2F7?quality=lossless");
    expect(stream).toEqual({ url: "https://cdn.example/a.flac", format: "flac", mime: "audio/flac" });
  });

  it("refuses a plain http stream address", async () => {
    fetchMock.mockResolvedValueOnce(reply({ url: "http://cdn.example/a.flac", format: "flac" }));
    await expect(streamAddon(ADDON, "1")).rejects.toThrow("can't use");
  });

  it("refuses HLS, DASH and encrypted streams", async () => {
    fetchMock.mockResolvedValueOnce(reply({ url: "https://cdn.example/a.m3u8", format: "flac", manifest: "hls" }));
    await expect(streamAddon(ADDON, "1")).rejects.toThrow("HLS or DASH");
    fetchMock.mockResolvedValueOnce(reply({ url: "https://cdn.example/a.flac", format: "flac", encrypted: "drm" }));
    await expect(streamAddon(ADDON, "1")).rejects.toThrow("encrypted");
  });

  it("refuses an audio format it does not know and passes on the add-on's own error", async () => {
    fetchMock.mockResolvedValueOnce(reply({ url: "https://cdn.example/a.bin", format: "xyz" }));
    await expect(streamAddon(ADDON, "1")).rejects.toThrow("can't play");
    fetchMock.mockResolvedValueOnce(reply({ error: "Not available in your region" }));
    await expect(streamAddon(ADDON, "1")).rejects.toThrow("Not available in your region");
  });
});

describe("testAddon", () => {
  it("reports ok with a latency when the search answers, even with no results", async () => {
    fetchMock.mockResolvedValueOnce(reply({ tracks: [] }));
    const health = await testAddon(ADDON);
    expect(health.ok).toBe(true);
    expect(health.error).toBeNull();
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports the failure instead of throwing", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const health = await testAddon(ADDON);
    expect(health.ok).toBe(false);
    expect(health.error).toBe("Could not reach the add-on");
  });
});
