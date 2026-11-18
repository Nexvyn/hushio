import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";

vi.mock("../lib/audio", () => ({
  audio: new Audio(),
  playStream: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seekTo: vi.fn(),
  setVolume: vi.fn(),
  setMuted: vi.fn(),
  getPlaybackPosition: vi.fn(() => 0),
  TEST_SONG_ID: "test-song-id",
  TEST_SONG_TITLE: "Test song",
}));

vi.mock("../lib/persist", () => ({
  persistStorage: () => ({
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  }),
}));

import { AmbientBackdrop, AmbientSync, flatFillFor } from "./AmbientBackdrop";
import { AMBIENT_FALLBACK } from "../lib/artworkPalette";

function parseFill(fill: string): [number, number, number] {
  const [r, g, b] = fill.slice(4, -1).split(/[ ,]+/).map(Number);
  return [r, g, b];
}

function contrastRatio(a: number[], b: number[]): number {
  const lum = (rgb: number[]) => {
    const [r, g, b] = rgb.map((value) => {
      const x = value / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SRC = "https://example.test/a.jpg";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("reduce-motion");
  document.documentElement.style.removeProperty("--ambient-0");
  document.documentElement.style.removeProperty("--ambient-1");
  vi.unstubAllGlobals();
});

function layers(container: HTMLElement) {
  return container.querySelectorAll("[data-ambient-backdrop] > div");
}

describe("AmbientBackdrop", () => {
  it("renders a hidden-from-AT backdrop with one flat fill and no image or gradients", () => {
    const { container } = render(<AmbientBackdrop primary="200 120 60" src={SRC} />);
    const root = container.querySelector("[data-ambient-backdrop]");
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    expect(layers(container)).toHaveLength(1);
    expect(root?.innerHTML).not.toContain("<img");
    expect(root?.innerHTML).not.toContain("gradient");
    expect(root?.innerHTML).not.toContain("blur");
    expect(root?.innerHTML).not.toContain("data:image");
  });

  it("fills with a deep tone of the artwork colour in the dark theme", () => {
    const fill = flatFillFor("200 120 60", false);
    const [r, g, b] = fill.slice(4, -1).split(" ").map(Number);
    expect(Math.max(r, g, b)).toBeLessThan(80);
  });

  it("keeps the dark fill near-black with only a faint hint of the cover hue", () => {
    for (const cover of ["200 120 60", "220 30 30", "30 60 200", "240 220 40"]) {
      const [r, g, b] = flatFillFor(cover, false).slice(4, -1).split(" ").map(Number);
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(40);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(20);
    }
  });

  it.each(["200 120 60", "220 30 30", "30 60 200", "240 220 40"])(
    "keeps ink-1 and ink-2 at 4.5:1 or better on the dark fill for cover %s",
    (cover) => {
      const fill = parseFill(flatFillFor(cover, false));
      expect(contrastRatio([245, 245, 247], fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio([174, 174, 178], fill)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("fills with a soft tone of the artwork colour in the light theme", () => {
    const fill = flatFillFor("200 120 60", true);
    const [r, g, b] = fill.slice(4, -1).split(" ").map(Number);
    expect(Math.min(r, g, b)).toBeGreaterThan(190);
  });

  it("uses a neutral fill when the colour cannot be read", () => {
    expect(flatFillFor("not a colour", false)).toBe("rgb(18 18 20)");
    const { container } = render(<AmbientBackdrop primary="200 120 60" />);
    expect(layers(container)[0].getAttribute("style")).toContain("rgb(18, 18, 20)");
  });

  it("uses the banner variant with a bottom fade mask and no image", () => {
    const { container } = render(<AmbientBackdrop primary="200 120 60" src={SRC} variant="banner" />);
    const root = container.querySelector<HTMLElement>("[data-ambient-backdrop]");
    expect(root?.getAttribute("data-variant")).toBe("banner");
    expect(root?.className).toContain("h-[460px]");
    expect(root?.getAttribute("style")).toContain("black 55%");
    expect(root?.innerHTML).not.toContain("<img");
  });

  it("cross-fades a colour change and removes the old layer afterwards", async () => {
    const { container, rerender } = render(<AmbientBackdrop primary="10 20 30" src={SRC} />);
    rerender(<AmbientBackdrop primary="200 120 60" src={SRC} />);
    expect(container.querySelector(".bt-ambient-in")).not.toBeNull();
    expect(layers(container)).toHaveLength(2);
    await waitFor(() => expect(layers(container)).toHaveLength(1), { timeout: 2000 });
  });

  it("swaps the colour instantly under Reduce Motion", () => {
    document.documentElement.classList.add("reduce-motion");
    const { container, rerender } = render(<AmbientBackdrop primary="10 20 30" src={SRC} />);
    rerender(<AmbientBackdrop primary="200 120 60" src={SRC} />);
    expect(container.querySelector(".bt-ambient-in")).toBeNull();
    expect(layers(container)).toHaveLength(1);
  });
});

describe("AmbientSync", () => {
  it("sets the neutral fallback on the root when nothing is playing", async () => {
    render(<AmbientSync />);
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--ambient-0")).toBe(AMBIENT_FALLBACK.primary),
    );
    expect(document.documentElement.style.getPropertyValue("--ambient-1")).toBe(AMBIENT_FALLBACK.secondary);
  });
});
