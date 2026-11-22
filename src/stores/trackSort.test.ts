import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ value: null as unknown, names: [] as string[] }));

vi.mock("../lib/persist", () => ({
  persistStorage: (name: string) => {
    storage.names.push(name);
    return {
      getItem: async () => storage.value,
      setItem: async (_name: string, value: unknown) => {
        storage.value = value;
      },
      removeItem: async () => {
        storage.value = null;
      },
    };
  },
}));

import { CUSTOM_SORT } from "../lib/trackSort";
import { useTrackSort } from "./trackSort";

describe("track sort store", () => {
  beforeEach(() => {
    useTrackSort.setState({ sorts: {} });
  });

  it("keeps the explicit persist version and storage name", () => {
    expect(useTrackSort.persist.getOptions().version).toBe(1);
    expect(useTrackSort.persist.getOptions().name).toBe("track-sorts");
    expect(storage.names).toContain("track-sorts");
  });

  it("defaults every list to custom order", () => {
    expect(useTrackSort.getState().sorts["playlist:p1"] ?? CUSTOM_SORT).toEqual({
      field: "custom",
      direction: "asc",
      then: null,
    });
  });

  it("stores the sort for one list key without touching the others", () => {
    const artist = { field: "artist" as const, direction: "asc" as const, then: "album" as const };
    useTrackSort.getState().setSort("playlist:p1", artist);
    useTrackSort.getState().setSort("liked", { field: "title", direction: "desc", then: null });

    expect(useTrackSort.getState().sorts["playlist:p1"]).toEqual(artist);
    expect(useTrackSort.getState().sorts.liked).toEqual({ field: "title", direction: "desc", then: null });
    expect(useTrackSort.getState().sorts.local).toBeUndefined();
  });

  it("returns to custom order when the sort is reset", () => {
    useTrackSort.getState().setSort("local", { field: "duration", direction: "asc", then: null });
    useTrackSort.getState().setSort("local", CUSTOM_SORT);

    expect(useTrackSort.getState().sorts.local).toEqual(CUSTOM_SORT);
  });
});
