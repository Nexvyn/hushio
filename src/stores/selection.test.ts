import { beforeEach, describe, expect, it } from "vitest";
import { nextSelection, useSelection } from "./selection";

const order = ["a", "b", "c", "d"];

describe("nextSelection", () => {
  it("replaces the selection on a plain click", () => {
    expect(nextSelection({ ids: ["a", "b"], anchor: "a" }, "c", order, "replace")).toEqual({ ids: ["c"], anchor: "c" });
  });

  it("adds and removes one row on Ctrl or Cmd click", () => {
    const added = nextSelection({ ids: ["a"], anchor: "a" }, "c", order, "toggle");
    expect(added).toEqual({ ids: ["a", "c"], anchor: "c" });
    expect(nextSelection(added, "a", order, "toggle")).toEqual({ ids: ["c"], anchor: "a" });
  });

  it("selects the rows between the anchor and the clicked row on Shift click, in list order", () => {
    expect(nextSelection({ ids: ["c"], anchor: "c" }, "a", order, "range")).toEqual({
      ids: ["a", "b", "c"],
      anchor: "c",
    });
    expect(nextSelection({ ids: ["b"], anchor: "b" }, "d", order, "range").ids).toEqual(["b", "c", "d"]);
  });

  it("falls back to the clicked row when Shift click has no anchor", () => {
    expect(nextSelection(undefined, "b", order, "range")).toEqual({ ids: ["b"], anchor: "b" });
  });
});

describe("useSelection", () => {
  beforeEach(() => {
    useSelection.setState({ lists: {} });
  });

  it("keeps each list's selection apart", () => {
    useSelection.getState().select("playlist:1", "a", order, "replace");
    useSelection.getState().selectAll("liked", order);
    expect(useSelection.getState().lists["playlist:1"]?.ids).toEqual(["a"]);
    expect(useSelection.getState().lists.liked?.ids).toEqual(order);
  });

  it("clears one list without touching the others", () => {
    useSelection.getState().selectAll("liked", order);
    useSelection.getState().selectAll("history", order);
    useSelection.getState().clear("liked");
    expect(useSelection.getState().lists.liked).toBeUndefined();
    expect(useSelection.getState().lists.history?.ids).toEqual(order);
  });
});
