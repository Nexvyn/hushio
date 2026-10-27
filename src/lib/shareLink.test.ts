import { describe, expect, it } from "vitest";
import { parsePlaylistShareLink, playlistShareLink, trackShareLink } from "./shareLink";

describe("playlist share link", () => {
  it("builds the YouTube Music link with the id and without the VL prefix", () => {
    expect(playlistShareLink("PLabc_-9")).toBe("https://music.youtube.com/playlist?list=PLabc_-9");
    expect(playlistShareLink("VLPLabc")).toBe("https://music.youtube.com/playlist?list=PLabc");
  });

  it("reads the id back from a built link", () => {
    expect(parsePlaylistShareLink(playlistShareLink("VLPLabc"))).toBe("PLabc");
  });

  it("reads the id from a link with other query values and surrounding spaces", () => {
    expect(parsePlaylistShareLink("  https://music.youtube.com/playlist?si=x&list=PLabc&feature=share  ")).toBe(
      "PLabc",
    );
  });

  it("rejects links with another scheme or another host", () => {
    expect(parsePlaylistShareLink("hushio://playlist?list=PLabc")).toBeNull();
    expect(parsePlaylistShareLink("http://music.youtube.com/playlist?list=PLabc")).toBeNull();
    expect(parsePlaylistShareLink("https://www.youtube.com/playlist?list=PLabc")).toBeNull();
  });

  it("rejects links with no playlist id", () => {
    expect(parsePlaylistShareLink("https://music.youtube.com/playlist")).toBeNull();
    expect(parsePlaylistShareLink("https://music.youtube.com/playlist?list=")).toBeNull();
    expect(parsePlaylistShareLink("https://music.youtube.com/playlist?listing=PLabc")).toBeNull();
    expect(parsePlaylistShareLink("not a link")).toBeNull();
  });
});

describe("track share link", () => {
  it("builds the watch link for a video id", () => {
    expect(trackShareLink("dQw4w9WgXcQ")).toBe("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
  });
});
