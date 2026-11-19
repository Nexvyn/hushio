import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("./bridge", () => ({ copyImage: vi.fn(async () => {}) }));

import { copyImage } from "./bridge";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  buildReplayCard,
  cardUrls,
  copyReplayCard,
  drawReplayCard,
  fit,
  lift,
  loadCardImages,
  renderReplayCard,
  type CardImages,
  type ReplayCardInput,
} from "./replayCard";
import type { ReplayData } from "./replay";

type Stub = CanvasRenderingContext2D & Record<string, unknown>;

function stubContext(): Stub {
  const target: Record<string, unknown> = {
    measureText: (text: string) => ({ width: text.length * 10 }),
    filter: "",
    createPattern: vi.fn(() => ({})),
    createImageData: vi.fn((width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) })),
  };
  for (const name of ["createLinearGradient", "createRadialGradient", "createConicGradient"]) {
    target[name] = vi.fn(() => ({ addColorStop: vi.fn() }));
  }
  return new Proxy(target, {
    get(object, property: string) {
      if (!(property in object)) object[property] = vi.fn();
      return object[property];
    },
    set(object, property: string, value) {
      object[property] = value;
      return true;
    },
  }) as unknown as Stub;
}

function drawn(ctx: Stub, method: string): unknown[][] {
  return (ctx[method] as Mock).mock.calls as unknown[][];
}

function textDrawn(ctx: Stub): string[] {
  return drawn(ctx, "fillText").map((call) => String(call[0]));
}

const card: ReplayCardInput = {
  periodLabel: "November 2026",
  minutes: 1204,
  plays: 3,
  activeDays: 2,
  songs: [
    { title: "First song", artist: "Artist one", thumb: null },
    { title: "Second song", artist: "Artist two", thumb: null },
  ],
  artists: [{ name: "Artist one", thumb: null, detail: "3 hrs" }],
  sleeve: null,
  label: null,
  colors: ["200 120 60", "240 180 110"],
};

function imageStub(width = 300, height = 300): HTMLImageElement {
  return { naturalWidth: width, naturalHeight: height } as unknown as HTMLImageElement;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => stubContext() as unknown as RenderingContext);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fit", () => {
  it("returns short text unchanged", () => {
    expect(fit(stubContext(), "short", 100)).toBe("short");
  });

  it("cuts long text to the longest prefix that fits with an ellipsis", () => {
    const ctx = stubContext();
    const cut = fit(ctx, "a long title that overflows", 100);
    expect(cut.endsWith("…")).toBe(true);
    expect(ctx.measureText(cut).width).toBeLessThanOrEqual(100);
    expect(cut).toBe("a long ti…");
  });

  it("returns only an ellipsis when nothing fits", () => {
    expect(fit(stubContext(), "anything", 5)).toBe("…");
  });
});

describe("lift", () => {
  it("adds to each channel and caps at 255", () => {
    expect(lift("200 250 10", 80)).toBe("255 255 90");
  });
});

describe("drawReplayCard", () => {
  it("paints the frame, header, minutes and footer", () => {
    const ctx = stubContext();
    drawReplayCard(ctx, card, new Map());
    const text = textDrawn(ctx);
    expect(text).toContain("Hushio");
    expect(text).toContain("REPLAY");
    expect(text).toContain("November 2026");
    expect(text).toContain((1204).toLocaleString());
    expect(text).toContain("MINUTES LISTENED");
    expect(text).toContain("Your listening, counted by Hushio");
  });

  it("writes the facts line with plays and days", () => {
    const ctx = stubContext();
    drawReplayCard(ctx, card, new Map());
    expect(textDrawn(ctx)).toContain("3 plays  ·  2 days");

    const single = stubContext();
    drawReplayCard(single, { ...card, plays: 1, activeDays: 1 }, new Map());
    expect(textDrawn(single)).toContain("1 play  ·  1 day");
  });

  it("numbers the top rows and lists song and artist text", () => {
    const ctx = stubContext();
    drawReplayCard(ctx, card, new Map());
    const text = textDrawn(ctx);
    expect(text).toEqual(expect.arrayContaining(["01", "02", "First song", "Artist one", "Second song", "3 hrs"]));
  });

  it("uses the full card size and draws the wash only with a label cover", () => {
    const withoutLabel = stubContext();
    drawReplayCard(withoutLabel, card, new Map());
    expect(withoutLabel.filter).toBe("");
    expect(drawn(withoutLabel, "fillRect")[0]).toEqual([0, 0, CARD_WIDTH, CARD_HEIGHT]);

    const withLabel = stubContext();
    const images: CardImages = new Map([["https://img/label.jpg", imageStub()]]);
    drawReplayCard(withLabel, { ...card, label: "https://img/label.jpg" }, images);
    expect(withLabel.filter).toBe("blur(90px) saturate(1.3)");
    expect(drawn(withLabel, "drawImage").length).toBeGreaterThan(0);
  });

  it("draws the sleeve when the top album has a cover and the record alone without one", () => {
    const withSleeve = stubContext();
    drawReplayCard(withSleeve, { ...card, sleeve: "https://img/sleeve.jpg" }, new Map([["https://img/sleeve.jpg", imageStub()]]));
    const sleeveCentre = drawn(withSleeve, "arc").some((call) => call[0] === 644);
    expect(sleeveCentre).toBe(true);

    const alone = stubContext();
    drawReplayCard(alone, card, new Map());
    expect(drawn(alone, "arc").some((call) => call[0] === 540)).toBe(true);
  });
});

describe("cardUrls and loadCardImages", () => {
  const withCovers: ReplayCardInput = {
    ...card,
    sleeve: "https://img/a.jpg",
    label: "https://img/a.jpg",
    songs: [{ title: "x", artist: "y", thumb: "https://img/b.jpg" }],
  };

  it("lists each cover once", () => {
    expect(cardUrls(withCovers)).toEqual(["https://img/a.jpg", "https://img/b.jpg"]);
  });

  it("loads covers and maps a failed cover to null", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 10;
        naturalHeight = 10;
        set src(url: string) {
          queueMicrotask(() => (url.endsWith("a.jpg") ? this.onload?.() : this.onerror?.()));
        }
      },
    );
    const images = await loadCardImages(withCovers);
    expect(images.get("https://img/a.jpg")).not.toBeNull();
    vi.unstubAllGlobals();

    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_url: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    const failed = await loadCardImages(withCovers);
    expect(failed.get("https://img/b.jpg")).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe("renderReplayCard", () => {
  let ctx: Stub;
  let sizes: { width: number; height: number } | null;

  beforeEach(() => {
    ctx = stubContext();
    sizes = null;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as RenderingContext);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback) {
      sizes = { width: this.width, height: this.height };
      callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a 1080 by 1920 PNG", async () => {
    const blob = await renderReplayCard(card);
    expect(blob.type).toBe("image/png");
    expect(sizes).toEqual({ width: 1080, height: 1920 });
    expect(textDrawn(ctx)).toContain("REPLAY");
  });

  it("rejects when the canvas cannot encode the card", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(null));
    await expect(renderReplayCard(card)).rejects.toThrow("could not be encoded");
  });

  it("rejects when no 2D context is available", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(renderReplayCard(card)).rejects.toThrow("Canvas 2D is unavailable");
  });
});

describe("copyReplayCard", () => {
  it("sends the PNG bytes to the clipboard wrapper", async () => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
    Object.defineProperty(blob, "arrayBuffer", { value: async () => new Uint8Array([137, 80, 78, 71]).buffer });
    await copyReplayCard(blob);
    expect(copyImage).toHaveBeenCalledWith(new Uint8Array([137, 80, 78, 71]));
  });
});

describe("buildReplayCard", () => {
  const data: ReplayData = {
    period: "month",
    months: ["2026-11"],
    totalMs: 7_200_000 + 30_000,
    plays: 9,
    tracks: Array.from({ length: 7 }, (_, index) => ({
      id: `t${index}`,
      title: `Song ${index}`,
      artist: `Artist ${index}`,
      thumb: index === 0 ? "https://img/top.jpg" : null,
      ms: 1000 * (7 - index),
      plays: 1,
    })),
    artists: [{ name: "Top artist", ms: 3_600_000, plays: 4 }],
    albums: [{ title: "Album", artist: "Top artist", thumb: "https://img/album.jpg", ms: 1, plays: 1 }],
    hours: new Array(24).fill(0),
    days: [],
    counts: { tracks: 7, artists: 1, albums: 1 },
  };

  it("maps the period data onto the card", () => {
    const built = buildReplayCard({ data, periodLabel: "November 2026", activeDays: 2, tint: "60 60 64" });
    expect(built.minutes).toBe(121);
    expect(built.plays).toBe(9);
    expect(built.activeDays).toBe(2);
    expect(built.songs).toHaveLength(5);
    expect(built.songs[0]).toEqual({ title: "Song 0", artist: "Artist 0", thumb: "https://img/top.jpg" });
    expect(built.artists).toEqual([{ name: "Top artist", thumb: null, detail: "1 hr" }]);
    expect(built.sleeve).toBe("https://img/album.jpg");
    expect(built.label).toBe("https://img/top.jpg");
    expect(built.colors).toEqual(["60 60 64", "100 100 104"]);
  });

  it("leaves the sleeve empty when no album is listed", () => {
    const built = buildReplayCard({ data: { ...data, albums: [] }, periodLabel: "x", activeDays: 0, tint: "1 2 3" });
    expect(built.sleeve).toBeNull();
  });
});
