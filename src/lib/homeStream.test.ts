import { describe, expect, it, vi } from "vitest";
import { createHomeStream, freshHomeShelves } from "./homeStream";
import type { Track } from "../types";
import type { RadioPage } from "./innertube";
import type { HomePage, HomeShelf } from "./home";

const region = { location: "US", lang: "en" };
const track = (id: string): Track => ({ id, title: id, artist: "Artist", thumb: null });
const shelf = (...ids: string[]): HomeShelf => ({ title: "Discover", items: ids.map(id => ({ kind: "track", track: track(id) })) });
const radioPage = (id: string): RadioPage => ({ items: [{ ...track(id), duration: 200, artistId: null, explicit: false, videoType: "song" }], continuation: null, seed: null });

describe("scrolling Home discovery", () => {
  it("keeps discovering new songs beyond the old eight-shelf cap", async () => {
    let sequence = 0;
    const stream = createHomeStream({ browse: vi.fn(), radio: async () => radioPage(String(++sequence).padStart(11, "0")) });
    stream.configure("home", region, [shelf("00000000000")], null, []);
    for (let page = 0; page < 25; page++) await stream.loadMore();
    expect(stream.getSnapshot().shelves).toHaveLength(25);
    expect(stream.getSnapshot().done).toBe(false);
  });
  it("deduplicates across pages without dropping distinct songs under the same heading", () => {
    const seen = new Set<string>();
    freshHomeShelves([shelf("a", "b")], seen);
    expect(freshHomeShelves([shelf("b", "c")], seen)[0].items).toEqual(shelf("c").items);
  });
  it("adds a continuation page without replacing previously loaded shelves", async () => {
    const browse = vi.fn().mockResolvedValueOnce({ shelves: [shelf("a")], continuation: "second" }).mockResolvedValueOnce({ shelves: [{ ...shelf("b"), title: "Second" }], continuation: null });
    const stream = createHomeStream({ browse, radio: vi.fn() });
    stream.configure("home", region, [], "first", []);
    await stream.loadMore(); await stream.loadMore();
    expect(stream.getSnapshot().shelves.map(s => s.items)).toEqual([shelf("a").items, shelf("b").items]);
  });
  it("keeps failed tokens retryable and leaves existing content visible", async () => {
    const browse = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ shelves: [shelf("a")], continuation: null });
    const stream = createHomeStream({ browse, radio: vi.fn() });
    stream.configure("home", region, [], "first", []);
    await stream.loadMore(); expect(stream.getSnapshot().error).not.toBeNull();
    await stream.loadMore();
    expect(browse.mock.calls.map(call => call[1])).toEqual(["first", "first"]);
    expect(stream.getSnapshot().shelves).toHaveLength(1);
  });
  it("ignores an old response after the market changes", async () => {
    let finish!: (page: HomePage) => void;
    const stream = createHomeStream({ browse: () => new Promise(resolve => { finish = resolve; }), radio: vi.fn() });
    stream.configure("US", region, [], "first", []);
    const pending = stream.loadMore();
    stream.configure("IN", { location: "IN", lang: "en" }, [], null, []);
    finish({ shelves: [shelf("stale")], continuation: null }); await pending;
    expect(stream.getSnapshot()).toMatchObject({ key: "IN", shelves: [], loading: false });
  });
  it("does not issue overlapping pagination requests", async () => {
    let finish!: (page: HomePage) => void;
    const browse = vi.fn(() => new Promise<HomePage>(resolve => { finish = resolve; }));
    const stream = createHomeStream({ browse, radio: vi.fn() });
    stream.configure("home", region, [], "first", []);
    const pending = stream.loadMore(); await stream.loadMore();
    expect(browse).toHaveBeenCalledTimes(1);
    finish({ shelves: [shelf("a")], continuation: null }); await pending;
  });
  it("continues with related music after Home pages are exhausted", async () => {
    const radio = vi.fn().mockResolvedValue(radioPage("bbbbbbbbbbb"));
    const stream = createHomeStream({ browse: vi.fn(), radio });
    stream.configure("home", region, [shelf("aaaaaaaaaaa")], null, []);
    await stream.loadMore();
    expect(radio).toHaveBeenCalledWith("aaaaaaaaaaa");
    expect(stream.getSnapshot().shelves[0].items).toMatchObject([{ track: { id: "bbbbbbbbbbb" } }]);
  });
  it("gives every radio continuation its own seed and a different title", async () => {
    let sequence = 0;
    const radio = vi.fn(async (_id: string) => radioPage(String(++sequence).padStart(11, "x")));
    const seeds = ["aaaaaaaaaa1", "aaaaaaaaaa2", "aaaaaaaaaa3", "aaaaaaaaaa4", "aaaaaaaaaa5"].map(track);
    const stream = createHomeStream({ browse: vi.fn(), radio });
    stream.configure("home", region, [], null, seeds);
    for (let page = 0; page < 4; page++) await stream.loadMore();
    const titles = stream.getSnapshot().shelves.map(s => s.title);
    expect(titles).toEqual(["More like aaaaaaaaaa1", "More like aaaaaaaaaa2", "More like aaaaaaaaaa3", "More like aaaaaaaaaa4"]);
    expect(radio.mock.calls.map(call => call[0])).toEqual(["aaaaaaaaaa1", "aaaaaaaaaa2", "aaaaaaaaaa3", "aaaaaaaaaa4"]);
  });
  it("never shows two shelves with the same title", async () => {
    const same = (id: string): Track => ({ ...track(id), title: "Same song" });
    const radio = vi.fn(async (id: string) => radioPage(id === "ccccccccccc" ? "ddddddddddd" : "eeeeeeeeeee"));
    const stream = createHomeStream({ browse: vi.fn(), radio });
    stream.configure("home", region, [], null, [same("ccccccccccc"), same("fffffffffff")]);
    await stream.loadMore(); await stream.loadMore();
    const titles = stream.getSnapshot().shelves.map(s => s.title);
    expect(titles[0]).toBe("More like Same song");
    expect(new Set(titles).size).toBe(titles.length);
    expect(radio.mock.calls.map(call => call[0])).not.toContain("fffffffffff");
  });
  it("does not keep requesting a repeated browse cursor", async () => {
    const browse = vi.fn().mockResolvedValue({ shelves: [shelf("a")], continuation: "first" });
    const stream = createHomeStream({ browse, radio: vi.fn() });
    stream.configure("home", region, [], "first", []);
    await stream.loadMore(); await stream.loadMore();
    expect(browse).toHaveBeenCalledTimes(1);
    expect(stream.getSnapshot().done).toBe(true);
  });
  it("keeps loaded content when returning to the same Home session", async () => {
    const stream = createHomeStream({ browse: vi.fn().mockResolvedValue({ shelves: [shelf("a")], continuation: "second" }), radio: vi.fn() });
    stream.configure("home", region, [], "first", []); await stream.loadMore();
    stream.configure("home", region, [], "first", []);
    expect(stream.getSnapshot().shelves).toHaveLength(1);
  });
});
