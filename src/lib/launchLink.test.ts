import { describe, expect, it } from "vitest";
import { launchTargetFor, parseAppLink, parseSharedText } from "./launchLink";

const ID = "dQw4w9WgXcQ";

describe("parseSharedText", () => {
  it.each([
    [`Listen ${`https://www.youtube.com/watch?v=${ID}`}`, { kind: "video", id: ID }],
    [`https://youtu.be/${ID}?si=abc`, { kind: "video", id: ID }],
    [`https://music.youtube.com/watch?v=${ID}&list=PL123`, { kind: "video", id: ID }],
    [`https://youtube.com/shorts/${ID}`, { kind: "video", id: ID }],
    ["https://music.youtube.com/playlist?list=OLAK5uy_abc-1", { kind: "playlist", id: "OLAK5uy_abc-1" }],
    [`https://www.youtube.com/playlist?list=PL9x&si=1`, { kind: "playlist", id: "PL9x" }],
  ])("reads %s", (text, target) => {
    expect(parseSharedText(text)).toEqual(target);
  });

  it("skips links that are not YouTube and takes the first YouTube link", () => {
    expect(parseSharedText(`https://example.com/a https://youtu.be/${ID}`)).toEqual({ kind: "video", id: ID });
  });

  it.each(["just words", "https://example.com/watch?v=" + ID, "https://youtu.be/short", "https://www.youtube.com/"])(
    "returns null for %s",
    (text) => {
      expect(parseSharedText(text)).toBeNull();
    },
  );
});

describe("parseAppLink", () => {
  it("opens a shared playlist from the app scheme", () => {
    expect(parseAppLink("hushio://playlist?list=PL123")).toEqual({ kind: "playlist", id: "PL123" });
  });

  it.each(["https://playlist?list=PL123", "hushio://album?list=PL123", "hushio://playlist", "hushio://playlist?list=a b", "not a url"])(
    "rejects %s",
    (link) => {
      expect(parseAppLink(link)).toBeNull();
    },
  );
});

describe("launchTargetFor", () => {
  it("routes each payload kind", () => {
    expect(launchTargetFor({ kind: "text", value: `https://youtu.be/${ID}` })).toEqual({ kind: "video", id: ID });
    expect(launchTargetFor({ kind: "link", value: "hushio://playlist?list=PL1" })).toEqual({ kind: "playlist", id: "PL1" });
    expect(launchTargetFor({ kind: "file", value: "content://media/external/audio/42" })).toEqual({
      kind: "file",
      uri: "content://media/external/audio/42",
    });
  });

  it("ignores an empty file value", () => {
    expect(launchTargetFor({ kind: "file", value: "" })).toBeNull();
  });
});
