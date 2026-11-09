import { describe, expect, it } from "vitest";
import topBar from "./TopBar.tsx?raw";
import profileButton from "./ProfileButton.tsx?raw";
import playerBar from "./PlayerBar.tsx?raw";
import sidebar from "./Sidebar.tsx?raw";
import themeButton from "./ThemeButton.tsx?raw";
import collectionHero from "./CollectionHero.tsx?raw";
import browseHero from "./BrowseHero.tsx?raw";
import coverStack from "./CoverStack.tsx?raw";
import libraryView from "../views/LibraryView.tsx?raw";
import albumView from "../views/AlbumView.tsx?raw";
import artistView from "../views/ArtistView.tsx?raw";
import remotePlaylistView from "../views/RemotePlaylistView.tsx?raw";
import playlistView from "../views/PlaylistView.tsx?raw";
import likedView from "../views/LikedView.tsx?raw";
import downloadsView from "../views/DownloadsView.tsx?raw";
import tokens from "../styles/tokens.css?raw";

const files = {
  topBar,
  profileButton,
  playerBar,
  sidebar,
  themeButton,
  collectionHero,
  browseHero,
  coverStack,
  libraryView,
  albumView,
  artistView,
  remotePlaylistView,
  playlistView,
  likedView,
  downloadsView,
};
const forbidden = /-(?:white|black)\b|#(?:fff|ffffff|000|000000)\b|\brgba?\(|\bhsla?\(|\bdrop-shadow\b/i;

function lightTokens(): Record<string, [number, number, number]> {
  const block = tokens.slice(tokens.indexOf(':root[data-theme="light"]'), tokens.indexOf("@media (prefers-color-scheme: light)"));
  const result: Record<string, [number, number, number]> = {};
  for (const [, name, r, g, b] of block.matchAll(/--([a-z0-9-]+): (\d+) (\d+) (\d+);/g)) {
    result[name] = [Number(r), Number(g), Number(b)];
  }
  return result;
}

function luminance([r, g, b]: [number, number, number]) {
  const [R, G, B] = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrast(a: [number, number, number], b: [number, number, number]) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("shell in light theme", () => {
  it.each(Object.entries(files))("%s uses no dark-only hard-coded colours", (_name, source) => {
    const found = source.split("\n").filter((line) => forbidden.test(line));
    expect(found).toEqual([]);
  });

  it("keeps primary and secondary text at AA contrast on every light ground", () => {
    const palette = lightTokens();
    const grounds = ["base", "surface", "wash", "hover", "selected", "pressed", "sidebar-selected"];
    for (const ground of grounds) {
      expect(contrast(palette["ink-2"], palette[ground]), `ink-2 on ${ground}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette["ink-1"], palette[ground]), `ink-1 on ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps hero text legible on the base ground the hero fades into", () => {
    const palette = lightTokens();
    expect(contrast(palette["ink-1"], palette.base)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette["ink-2"], palette.base)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the primary button label at AA contrast", () => {
    const palette = lightTokens();
    expect(contrast(palette["on-primary"], palette.primary)).toBeGreaterThanOrEqual(4.5);
  });
});
