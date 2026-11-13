import { describe, expect, it } from "vitest";
import { artworkUrlOk, thumbArtwork, thumbPixels, upgradeArtwork } from "./artwork";
import { fmtTime } from "./format";

describe("thumbArtwork", () => {
  it("serves the 320 pixel YouTube frame, without black bars, for small thumbs", () => {
    expect(thumbArtwork("https://i.ytimg.com/vi/abc123/hqdefault.jpg?sqp=xyz", 48)).toBe(
      "https://i.ytimg.com/vi/abc123/mqdefault.jpg",
    );
    expect(thumbArtwork("https://i.ytimg.com/vi/abc123/sddefault.jpg", 120)).toBe(
      "https://i.ytimg.com/vi/abc123/mqdefault.jpg",
    );
    expect(thumbArtwork("https://i.ytimg.com/vi/abc123/maxresdefault.jpg", 48)).toBe(
      "https://i.ytimg.com/vi/abc123/mqdefault.jpg",
    );
  });

  it("keeps the larger YouTube frame for bigger targets", () => {
    expect(thumbArtwork("https://i.ytimg.com/vi/abc123/hqdefault.jpg", 132)).toBe(
      "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    );
  });

  it("rewrites the size suffix of Google images to the device size bucket", () => {
    expect(thumbArtwork("https://lh3.googleusercontent.com/abc=w544-h544-c", 48, 2)).toBe(
      "https://lh3.googleusercontent.com/abc=w120-h120-c",
    );
    expect(thumbArtwork("https://lh3.googleusercontent.com/abc=s1200", 132, 2.75)).toBe(
      "https://lh3.googleusercontent.com/abc=s544",
    );
    expect(thumbArtwork("https://yt3.ggpht.com/a/w544-h544-l90-rj/photo.jpg", 48, 2.625)).toBe(
      "https://yt3.ggpht.com/a/w226-h226-l90-rj/photo.jpg",
    );
    expect(thumbArtwork("https://yt3.googleusercontent.com/x=s544-c-k", 48, 1)).toBe(
      "https://yt3.googleusercontent.com/x=s120-c-k",
    );
  });

  it("leaves unknown hosts and local art untouched and rejects unsafe addresses", () => {
    expect(thumbArtwork("https://example.com/cover.jpg", 48)).toBe("https://example.com/cover.jpg");
    expect(thumbArtwork("localart://localhost/0123456789abcdef.jpg", 48)).toBe(
      "localart://localhost/0123456789abcdef.jpg",
    );
    expect(thumbArtwork("file:///cover.jpg", 48)).toBe("");
    expect(thumbArtwork(null, 48)).toBe("");
  });

  it("picks the first size bucket that covers the target in device pixels", () => {
    expect(thumbPixels(48, 1)).toBe(120);
    expect(thumbPixels(48, 2.625)).toBe(226);
    expect(thumbPixels(176, 2.75)).toBe(544);
    expect(thumbPixels(400, 2)).toBe(544);
  });
});

describe("artwork scheme gate", () => {
  it.each([
    "https://lh3.googleusercontent.com/abc=s60",
    "data:image/png;base64,AAAA",
    "blob:https://app.local/1234",
    "localart://localhost/0123456789abcdef.jpg",
    "http://localart.localhost/0123456789abcdef.jpg",
  ])("accepts %s", (url) => {
    expect(artworkUrlOk(url)).toBe(true);
  });

  it.each([
    "http://example.com/cover.jpg",
    "file:///C:/Users/amang/cover.jpg",
    "\\\\server\\share\\cover.jpg",
    "data:text/html,<script>",
    "javascript:alert(1)",
    "",
  ])("rejects %s", (url) => {
    expect(artworkUrlOk(url)).toBe(false);
  });

  it("returns an empty string for unusable input", () => {
    expect(upgradeArtwork("file:///cover.jpg")).toBe("");
    expect(upgradeArtwork(null)).toBe("");
    expect(upgradeArtwork(undefined)).toBe("");
  });
});

describe("upgradeArtwork", () => {
  it("trims the address before checking it", () => {
    expect(upgradeArtwork("  https://lh3.googleusercontent.com/abc=s60  ")).toBe(
      "https://lh3.googleusercontent.com/abc=s544",
    );
  });

  it("raises the size markers to the target", () => {
    expect(upgradeArtwork("https://lh3.googleusercontent.com/abc=s60")).toBe(
      "https://lh3.googleusercontent.com/abc=s544",
    );
    expect(upgradeArtwork("https://lh3.googleusercontent.com/abc=w60-h60-c")).toBe(
      "https://lh3.googleusercontent.com/abc=w544-h544-c",
    );
    expect(upgradeArtwork("https://yt3.ggpht.com/a/w120-h120-l90-rj/photo.jpg")).toBe(
      "https://yt3.ggpht.com/a/w544-h544-l90-rj/photo.jpg",
    );
  });

  it("uses a larger target when one is given", () => {
    expect(upgradeArtwork("https://lh3.googleusercontent.com/abc=s60", 1200)).toBe(
      "https://lh3.googleusercontent.com/abc=s1200",
    );
  });

  it("maps small placeholder names to a sharp YouTube thumbnail", () => {
    expect(upgradeArtwork("https://i.ytimg.com/vi/abc123/mqdefault.jpg?sqp=xyz")).toBe(
      "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    );
    expect(upgradeArtwork("https://i.ytimg.com/vi/abc123/default.jpg")).toBe(
      "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    );
    expect(upgradeArtwork("https://i.ytimg.com/vi/abc123/HQ720")).toBe(
      "https://i.ytimg.com/vi/abc123/hq720.jpg",
    );
  });

  it("replaces the 50 and 150 pixel sizes", () => {
    expect(upgradeArtwork("https://example.com/150x150.png")).toBe("https://example.com/500x500.png");
  });

  it("keeps local art addresses as they are", () => {
    expect(upgradeArtwork("localart://localhost/0123456789abcdef.jpg")).toBe(
      "localart://localhost/0123456789abcdef.jpg",
    );
  });
});

describe("fmtTime", () => {
  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [65, "1:05"],
    [3723, "1:02:03"],
    [Number.NaN, "0:00"],
    [-3, "0:00"],
  ])("formats %s as %s", (seconds, text) => {
    expect(fmtTime(seconds)).toBe(text);
  });
});
