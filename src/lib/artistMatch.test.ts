import { describe, expect, it } from "vitest";
import { artistNamesOf, isByArtist } from "./artistMatch";

const nova = { id: "UCnova", name: "Nova" };

describe("artistNamesOf", () => {
  it("splits joined credits into normalised names", () => {
    expect(artistNamesOf("Nova, Sol & Lumen feat. Vega")).toEqual(["nova", "sol", "lumen", "vega"]);
    expect(artistNamesOf("  NOVA  x  Sol ")).toEqual(["nova", "sol"]);
  });
});

describe("isByArtist", () => {
  it("matches a credit that lists the artist among several", () => {
    expect(isByArtist({ artist: "Sol, Nova" }, nova)).toBe(true);
    expect(isByArtist({ artist: "Sol & NOVA" }, nova)).toBe(true);
    expect(isByArtist({ artist: "Sol feat. Nova" }, nova)).toBe(true);
  });

  it("does not match a different artist whose name contains the same letters", () => {
    expect(isByArtist({ artist: "Novaline" }, nova)).toBe(false);
    expect(isByArtist({ artist: "Sol" }, nova)).toBe(false);
  });

  it("matches by artist id when the track carries one", () => {
    expect(isByArtist({ artist: "Other Name", artistId: "UCnova" }, nova)).toBe(true);
  });
});
