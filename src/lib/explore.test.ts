import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, getSession } = vi.hoisted(() => {
  const execute = vi.fn();
  return { execute, getSession: vi.fn(async () => ({ innertube: { actions: { execute } } })) };
});

vi.mock("youtubei.js", () => ({ Innertube: { create: vi.fn() } }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("./innertube", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./innertube")>()),
  getSession,
  withRetry: async <T>(run: () => Promise<T>) => run(),
}));

import type * as Explore from "./explore";
import { FALLBACK_MOODS } from "./moods";

const CATEGORY = "FEmusic_moods_and_genres_category";

function button(title: string, browseId: string, params: string | null, argb?: number) {
  return {
    musicNavigationButtonRenderer: {
      buttonText: { runs: [{ text: title }] },
      clickCommand: { browseEndpoint: { browseId, ...(params ? { params } : {}) } },
      ...(argb === undefined ? {} : { solid: { leftStripeColor: argb } }),
    },
  };
}

function gridPage(section: string, buttons: unknown[]) {
  return {
    contents: [
      {
        gridRenderer: {
          header: { gridHeaderRenderer: { title: { simpleText: section } } },
          items: buttons,
        },
      },
    ],
  };
}

function moodButtons(count: number, section: string) {
  return Array.from({ length: count }, (_, index) =>
    button(`${section} ${index}`, CATEGORY, `p${index}`, 0xff000000 | (index + 1)),
  );
}

function cover(url: string) {
  return {
    musicTwoRowItemRenderer: {
      thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url }] } } },
    },
  };
}

let explore: typeof Explore;

beforeEach(async () => {
  vi.resetModules();
  explore = await import("./explore");
  execute.mockReset();
  getSession.mockClear();
});

function answer(pages: Record<string, unknown>) {
  execute.mockImplementation(async (_path: string, body: { browseId: string }) => {
    const data = pages[body.browseId];
    if (data instanceof Error) throw data;
    return { data: data ?? {} };
  });
}

describe("parseMoods", () => {
  it("reads the title, browse id, params, section and #rrggbb colour", () => {
    const moods = explore.parseMoods(
      gridPage("Genres", [button("Focus flow", CATEGORY, "params-focus", 0xffe13300)]),
    );
    expect(moods).toEqual([
      {
        title: "Focus flow",
        browseId: CATEGORY,
        params: "params-focus",
        color: "#e13300",
        section: "Genres",
      },
    ]);
  });

  it("uses a null section, params and colour when the data has none", () => {
    const moods = explore.parseMoods({
      contents: [{ gridRenderer: { items: [button("Plain", CATEGORY, null)] } }],
    });
    expect(moods).toEqual([
      { title: "Plain", browseId: CATEGORY, params: null, color: null, section: null },
    ]);
  });

  it("keeps the first entry for a repeated title and skips entries without a browse id", () => {
    const moods = explore.parseMoods(
      gridPage("Moods", [
        button("Chill", CATEGORY, "a", 1),
        button("Chill", CATEGORY, "b", 2),
        { musicNavigationButtonRenderer: { buttonText: { simpleText: "Broken" } } },
      ]),
    );
    expect(moods.map((mood) => [mood.title, mood.params])).toEqual([["Chill", "a"]]);
  });
});

describe("parseMoodCovers", () => {
  it("upgrades the first thumbnails of the first two cards", () => {
    const covers = explore.parseMoodCovers(
      {
        contents: [
          cover("https://lh3.googleusercontent.com/a=s60"),
          cover("https://lh3.googleusercontent.com/b=s60"),
          cover("https://lh3.googleusercontent.com/c=s60"),
        ],
      },
      2,
    );
    expect(covers).toEqual([
      "https://lh3.googleusercontent.com/a=s544",
      "https://lh3.googleusercontent.com/b=s544",
    ]);
  });

  it("skips covers whose address is not an allowed image", () => {
    const covers = explore.parseMoodCovers({ contents: [cover("javascript:alert(1)")] }, 2);
    expect(covers).toEqual([]);
  });
});

describe("getMoodCovers", () => {
  it("browses the mood page and parses its covers", async () => {
    answer({ [CATEGORY]: { contents: [cover("https://lh3.googleusercontent.com/a=s60")] } });
    const covers = await explore.getMoodCovers(CATEGORY, "p1");
    expect(covers).toEqual(["https://lh3.googleusercontent.com/a=s544"]);
    expect(execute).toHaveBeenCalledWith("/browse", { browseId: CATEGORY, params: "p1", client: "YTMUSIC" });
  });
});

describe("getMoods", () => {
  it("stops at the first list when it has at least six moods", async () => {
    answer({ FEmusic_moods_and_genres: gridPage("Genres", moodButtons(6, "Genre")) });
    const moods = await explore.getMoods();
    expect(moods).toHaveLength(6);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reads FEmusic_explore when the first list is short", async () => {
    answer({
      FEmusic_moods_and_genres: gridPage("Genres", moodButtons(2, "Genre")),
      FEmusic_explore: gridPage("Explore", moodButtons(7, "Explore")),
    });
    const moods = await explore.getMoods();
    expect(moods).toHaveLength(7);
    expect(execute.mock.calls.map((call) => call[1].browseId)).toEqual([
      "FEmusic_moods_and_genres",
      "FEmusic_explore",
    ]);
  });

  it("keeps the first list when the explore page fails", async () => {
    answer({
      FEmusic_moods_and_genres: gridPage("Genres", moodButtons(3, "Genre")),
      FEmusic_explore: new Error("offline"),
    });
    expect(await explore.getMoods()).toHaveLength(3);
  });
});

describe("loadMoods", () => {
  it("keeps only moods from the moods and genres category", async () => {
    answer({
      FEmusic_moods_and_genres: gridPage("Genres", [
        ...moodButtons(6, "Genre"),
        button("Podcast", "MPSPPL123", null),
      ]),
    });
    const moods = await explore.loadMoods(0);
    expect(moods).toHaveLength(6);
    expect(moods.every((mood) => mood.browseId.includes("moods_and_genres_category"))).toBe(true);
  });

  it("returns the fallback moods when fewer than six are usable", async () => {
    answer({ FEmusic_moods_and_genres: gridPage("Genres", moodButtons(5, "Genre")) });
    expect(await explore.loadMoods(0)).toEqual(FALLBACK_MOODS);
    expect(explore.freshMoods(0)).toBeNull();
  });

  it("returns the fallback moods when the provider throws", async () => {
    answer({
      FEmusic_moods_and_genres: new Error("network"),
      FEmusic_explore: new Error("network"),
    });
    expect(await explore.loadMoods(0)).toEqual(FALLBACK_MOODS);
  });

  it("reuses a result for 24 hours, then asks again", async () => {
    const hour = 3_600_000;
    answer({ FEmusic_moods_and_genres: gridPage("Genres", moodButtons(6, "Genre")) });
    await explore.loadMoods(0);
    await explore.loadMoods(23 * hour);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(explore.freshMoods(23 * hour)).toHaveLength(6);

    await explore.loadMoods(25 * hour);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
