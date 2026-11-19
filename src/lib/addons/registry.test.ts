import { describe, expect, it } from "vitest";
import {
  addAddonSource,
  enabledAddons,
  importedAddonSources,
  moveAddonSource,
  normalizeAddonUrl,
  parseAddonSources,
  removeAddonSource,
  setAddonEnabled,
  sourceFromManifest,
  validateManifest,
} from "./registry";
import { ADDON_LIMIT, AddonError, type AddonManifest, type AddonSource } from "./types";

const GOOD = {
  id: "flac-addon",
  name: "Flac Add-on",
  version: "1.2.0",
  resources: ["search", "stream"],
  settings: [{ key: "quality", default: "high", options: [{ value: "lossless", label: "Lossless" }, { value: "high" }] }],
};

const manifest = (id: string): AddonManifest => validateManifest({ ...GOOD, id, name: id });

const source = (id: string, priority: number, enabled = true): AddonSource => ({
  ...sourceFromManifest(`https://${id}.example`, manifest(id)),
  priority,
  enabled,
});

describe("validateManifest", () => {
  it("accepts a well-formed manifest and reads the quality options", () => {
    const parsed = validateManifest(GOOD);
    expect(parsed.id).toBe("flac-addon");
    expect(parsed.name).toBe("Flac Add-on");
    expect(parsed.resources).toEqual(["search", "stream"]);
    expect(parsed.settings).toEqual([
      { key: "quality", defaultValue: "high", options: ["lossless", "high"] },
    ]);
  });

  it("names the add-on after its id when no name is given", () => {
    expect(validateManifest({ ...GOOD, name: undefined }).name).toBe("flac-addon");
  });

  it("rejects a manifest without an id", () => {
    expect(() => validateManifest({ ...GOOD, id: undefined })).toThrow(AddonError);
  });

  it("rejects an id with characters outside the allowed set", () => {
    expect(() => validateManifest({ ...GOOD, id: "bad id/../x" })).toThrow(AddonError);
  });

  it("rejects a manifest that does not offer both search and stream", () => {
    expect(() => validateManifest({ ...GOOD, resources: ["search"] })).toThrow("search and stream");
    expect(() => validateManifest({ ...GOOD, resources: undefined })).toThrow(AddonError);
  });

  it("rejects an add-on that needs sign-in", () => {
    expect(() => validateManifest({ ...GOOD, bitchordAuth: true })).toThrow("sign-in");
  });

  it("rejects oversize fields and lists", () => {
    expect(() => validateManifest({ ...GOOD, name: "x".repeat(200) })).toThrow(AddonError);
    expect(() => validateManifest({ ...GOOD, resources: [...GOOD.resources, ...Array(10).fill("x")] })).toThrow(AddonError);
    expect(() => validateManifest({ ...GOOD, settings: Array(21).fill({ key: "quality" }) })).toThrow(AddonError);
  });

  it("rejects settings with a malformed key or option", () => {
    expect(() => validateManifest({ ...GOOD, settings: [{ key: "1bad" }] })).toThrow(AddonError);
    expect(() => validateManifest({ ...GOOD, settings: [{ key: "quality", options: [{ value: {} }] }] })).toThrow(AddonError);
  });

  it("rejects a value that is not a manifest object", () => {
    expect(() => validateManifest("https://example.com")).toThrow(AddonError);
    expect(() => validateManifest([])).toThrow(AddonError);
  });
});

describe("normalizeAddonUrl", () => {
  it("keeps https and strips trailing slashes", () => {
    expect(normalizeAddonUrl(" https://addon.example/api/ ")).toBe("https://addon.example/api");
  });

  it("rejects plain http", () => {
    expect(() => normalizeAddonUrl("http://addon.example")).toThrow("https://");
  });

  it("rejects credentials, query strings and private hosts", () => {
    expect(() => normalizeAddonUrl("https://user:pw@addon.example")).toThrow(AddonError);
    expect(() => normalizeAddonUrl("https://addon.example/?key=1")).toThrow(AddonError);
    expect(() => normalizeAddonUrl("https://localhost:8443")).toThrow(AddonError);
    expect(() => normalizeAddonUrl("https://192.168.1.10")).toThrow(AddonError);
    expect(() => normalizeAddonUrl("https://[::1]")).toThrow(AddonError);
  });

  it("rejects an empty or non-URL value", () => {
    expect(() => normalizeAddonUrl("   ")).toThrow(AddonError);
    expect(() => normalizeAddonUrl("not a url")).toThrow(AddonError);
  });
});

describe("parseAddonSources", () => {
  it("round-trips a valid list", () => {
    const list = [source("alpha", 0), source("beta", 1, false)];
    expect(parseAddonSources(JSON.parse(JSON.stringify(list)))).toEqual(list);
  });

  it("rejects the whole list when any entry is malformed", () => {
    const bad = { ...source("alpha", 0), baseUrl: "http://alpha.example" };
    expect(parseAddonSources([source("beta", 0), bad])).toBeNull();
  });

  it("rejects duplicates, non-arrays and lists over the limit", () => {
    expect(parseAddonSources([source("alpha", 0), source("alpha", 1)])).toBeNull();
    expect(parseAddonSources({})).toBeNull();
    const many = Array.from({ length: ADDON_LIMIT + 1 }, (_, i) => source(`a${i}`, i));
    expect(parseAddonSources(many)).toBeNull();
  });
});

describe("registry ordering", () => {
  it("orders enabled add-ons by priority and skips disabled ones", () => {
    const list = [source("c", 2), source("a", 0), source("b", 1, false)];
    expect(enabledAddons(list).map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("moves an add-on up and down and renumbers priorities", () => {
    const list = [source("a", 0), source("b", 1), source("c", 2)];
    const movedUp = moveAddonSource(list, "c", -1);
    expect(movedUp.map((item) => item.id)).toEqual(["a", "c", "b"]);
    expect(movedUp.map((item) => item.priority)).toEqual([0, 1, 2]);
    expect(moveAddonSource(list, "a", -1).map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(moveAddonSource(list, "c", 1).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("adds at the end and refuses duplicate ids, base addresses and a full list", () => {
    const list = [source("a", 0)];
    expect(addAddonSource(list, source("b", 0)).map((item) => item.priority)).toEqual([0, 1]);
    expect(() => addAddonSource(list, source("a", 0))).toThrow("already added");
    const clash = { ...source("z", 0), baseUrl: "https://a.example" };
    expect(() => addAddonSource(list, clash)).toThrow("already added");
    const full = Array.from({ length: ADDON_LIMIT }, (_, i) => source(`x${i}`, i));
    expect(() => addAddonSource(full, source("late", 0))).toThrow(AddonError);
  });

  it("removes an add-on and closes the gap in priorities", () => {
    const list = [source("a", 0), source("b", 1), source("c", 2)];
    expect(removeAddonSource(list, "b").map((item) => [item.id, item.priority])).toEqual([
      ["a", 0],
      ["c", 1],
    ]);
  });

  it("toggles one add-on without touching the others", () => {
    const list = [source("a", 0), source("b", 1)];
    expect(setAddonEnabled(list, "b", false).map((item) => item.enabled)).toEqual([true, false]);
  });

  it("imports add-ons disabled so a backup cannot switch a third party on", () => {
    expect(importedAddonSources([source("a", 0)])[0].enabled).toBe(false);
  });
});
