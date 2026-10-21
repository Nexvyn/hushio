import { beforeEach, describe, expect, it, vi } from "vitest";

const pluginFetch = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response("{}"));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: (input: unknown, init?: RequestInit) => pluginFetch(input, init) }));

import { ytFetch } from "./ytFetch";

function sentHeaders(): Headers {
  return new Headers(pluginFetch.mock.calls[0][1]?.headers);
}

describe("ytFetch", () => {
  beforeEach(() => pluginFetch.mockClear());

  it("sends the YouTube origin on YouTube hosts", async () => {
    await ytFetch("https://music.youtube.com/youtubei/v1/search", { method: "POST" });
    expect(sentHeaders().get("origin")).toBe("https://music.youtube.com");
  });

  it("keeps the caller headers and replaces a wrong origin", async () => {
    await ytFetch("https://www.youtube.com/youtubei/v1/player", {
      headers: { "x-goog-visitor-id": "abc", origin: "http://localhost:5173" },
    });
    const headers = sentHeaders();
    expect(headers.get("x-goog-visitor-id")).toBe("abc");
    expect(headers.get("origin")).toBe("https://www.youtube.com");
  });

  it("keeps the headers of a Request input", async () => {
    await ytFetch(new Request("https://www.youtube.com/youtubei/v1/next", { headers: { "x-test": "1" } }));
    const headers = sentHeaders();
    expect(headers.get("x-test")).toBe("1");
    expect(headers.get("origin")).toBe("https://www.youtube.com");
  });

  it("leaves other hosts untouched", async () => {
    await ytFetch("https://pipedapi.kavin.rocks/streams/x", { headers: { accept: "application/json" } });
    expect(pluginFetch.mock.calls[0][1]?.headers).toEqual({ accept: "application/json" });
  });
});
