export type JournalEntry = {
  track: { id: string; title: string; artist: string; thumb: string | null };
  at: number;
  heard: number;
};

export type ReplayPeriod = "week" | "month" | "lastMonth" | "year" | "all";

export type ReplayTrack = { id: string; title: string; artist: string; thumb: string | null; ms: number; plays: number };
export type ReplayArtist = { name: string; ms: number; plays: number };
export type ReplayAlbum = { title: string; artist: string; thumb: string | null; ms: number; plays: number };
export type DayMs = { date: string; ms: number };

export type ReplayData = {
  period: ReplayPeriod;
  months: string[];
  totalMs: number;
  plays: number;
  tracks: ReplayTrack[];
  artists: ReplayArtist[];
  albums: ReplayAlbum[];
  hours: number[];
  days: DayMs[];
  counts: { tracks: number; artists: number; albums: number };
};
