import { describe, expect, it } from "vitest";
import { takeoutFile, takeoutName } from "./importTakeout";
import { MAX_SONGS } from "./importParse";

const NEWER = [
  "Video ID,Playlist Video Creation Timestamp",
  "dQw4w9WgXcQ,2023-01-02T03:04:05.123456+00:00",
  "jNQXAC9IVRw,2023-01-03T03:04:05.123456+00:00",
  "bad-id,2023-01-04T03:04:05.123456+00:00",
  "9bZkp7q19f0,",
].join("\n");

const OLDER = [
  "Playlist,Road trip",
  "Visibility,Private",
  "",
  "Video Id,Time Added",
  "dQw4w9WgXcQ,2021-05-01T10:00:00+00:00",
  "short,2021-05-01T10:00:00+00:00",
  "9bZkp7q19f0,2021-05-02T10:00:00+00:00",
].join("\n");

const LIBRARY = [
  "Video ID,Song Title,Album Title,Artist Name 1,Artist Name 2,Artist Name 3",
  "fJ9rUzIMcZQ,Bohemian Rhapsody,A Night at the Opera,Queen,,",
  '"kJQP7kiw5Fk","Hello, World",Demo,Band One,Band Two,',
  "nope,Skipped Song,,Someone,,",
  "dQw4w9WgXcQ,,,Rick Astley,,",
].join("\n");

const INDEX = [
  "Playlist ID,Playlist Title (Original),Playlist Title (Localized),Playlist Visibility",
  "PLx1,Road trip,Road trip,PRIVATE",
  "PLx2,Workout,Workout,PUBLIC",
].join("\n");

const EXPORTIFY = ["Track URI,Track Name,Album Name,Artist Name(s),Track Duration (ms)", 'spotify:track:1,Song,Album,"A, B",200000'].join("\n");

describe("takeoutName", () => {
  it("drops the newer and older suffixes", () => {
    expect(takeoutName("Road trip-videos.csv")).toBe("Road trip");
    expect(takeoutName("Road trip.csv")).toBe("Road trip");
    expect(takeoutName("Road trip.CSV")).toBe("Road trip");
  });
});

describe("takeoutFile playlists", () => {
  it("reads the newer playlist format and skips ids that are not 11 characters", () => {
    expect(takeoutFile("Road trip-videos.csv", NEWER)).toEqual({
      kind: "playlist",
      name: "Road trip",
      ids: ["dQw4w9WgXcQ", "jNQXAC9IVRw", "9bZkp7q19f0"],
      skipped: 1,
    });
  });

  it("finds the header below the metadata lines of the older format", () => {
    expect(takeoutFile("Road trip.csv", OLDER)).toEqual({
      kind: "playlist",
      name: "Road trip",
      ids: ["dQw4w9WgXcQ", "9bZkp7q19f0"],
      skipped: 1,
    });
  });

  it("routes Liked music and Liked videos files to the liked list", () => {
    expect(takeoutFile("Liked music-videos.csv", NEWER)).toMatchObject({ kind: "liked", ids: expect.any(Array) });
    expect(takeoutFile("Liked videos.csv", OLDER)).toMatchObject({ kind: "liked" });
    expect(takeoutFile("Liked music (1)-videos.csv", NEWER)).toMatchObject({ kind: "liked" });
  });

  it("caps a file at the song limit", () => {
    const rows = ["Video ID,Playlist Video Creation Timestamp"];
    for (let index = 0; index < MAX_SONGS + 5; index += 1) rows.push("dQw4w9WgXcQ,");
    const parsed = takeoutFile("Big-videos.csv", rows.join("\n"));
    expect(parsed?.kind === "playlist" && parsed.ids.length).toBe(MAX_SONGS);
  });
});

describe("takeoutFile music library songs", () => {
  it("reads titles, albums and joined artists directly and skips bad rows", () => {
    expect(takeoutFile("music library songs.csv", LIBRARY)).toEqual({
      kind: "library",
      songs: [
        { id: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen", album: "A Night at the Opera" },
        { id: "kJQP7kiw5Fk", title: "Hello, World", artist: "Band One, Band Two", album: "Demo" },
      ],
      skipped: 2,
    });
  });
});

describe("takeoutFile playlists index", () => {
  it("maps playlist ids to titles and never returns songs", () => {
    const parsed = takeoutFile("playlists.csv", INDEX);
    expect(parsed?.kind).toBe("index");
    expect(parsed && parsed.kind === "index" ? [...parsed.titles] : []).toEqual([
      ["PLx1", "Road trip"],
      ["PLx2", "Workout"],
    ]);
  });
});

describe("takeoutFile other csv files", () => {
  it("leaves Exportify and other song lists to the normal flow", () => {
    expect(takeoutFile("Favourites.csv", EXPORTIFY)).toBeNull();
    expect(takeoutFile("notes.csv", "Artist,Title\nA,B")).toBeNull();
  });
});
