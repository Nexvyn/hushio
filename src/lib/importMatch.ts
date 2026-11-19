import type { ImportSong } from "./importParse";
import { isMatchLanguage, MATCH_LANGUAGES, type MatchLanguage } from "./importLanguage";
import { loadMatchCache, readMatch, writeMatch } from "./importMatchCache";
import { normalizeTitle } from "./autoplay";
import { searchPage } from "./search";
import type { SearchSong } from "./searchParse";

const VERSION_WORDS = "remix|live|acoustic|instrumental|unplugged|karaoke|slowed|reverb|sped|nightcore|lo-?fi|cover|reprise|mashup|8d";
const VERSION_ALL = new RegExp(`\\b(?:${VERSION_WORDS})\\b`, "giu");
const VERSION_ONE = new RegExp(`\\b(?:${VERSION_WORDS})\\b`, "iu");
const BRACKETS = /[([{【「『][^)\]}】」』]*[)\]}】」』]/g;
const TAIL = /\s[-–—]\s.*$/;
const LEADING_TAIL = /^\s[-–—]\s/;
const ARTIST_SEPARATOR = /\s*(?:,|&|\+|\/|;|、|\sx\s|\sand\s|\s(?:feat|ft)\.?\s|\sfeaturing\s|\swith\s|\svs\.?\s)\s*/iu;
const FIRST_ARTIST = /,|&| x | feat /i;
const LANGUAGE_WORDS = [...MATCH_LANGUAGES, "bengali", "marathi", "punjabi", "gujarati"];
const MIN_TITLE_SIMILARITY = 0.85;
const MAX_LENGTH_GAP = 15;

export function titleWords(title: string): string {
  return normalizeTitle(title.replace(BRACKETS, " ").replace(TAIL, ""));
}

export function versionMarks(title: string): string {
  const found = new Set((title.normalize("NFKC").toLowerCase().match(VERSION_ALL) ?? []).map((word) => word.replace(/-/g, "")));
  return [...found].sort().join(" ");
}

function artistNames(artist: string): string[] {
  return artist
    .split(ARTIST_SEPARATOR)
    .map((name) => name.normalize("NFKC").toLowerCase().replace(/\s+/g, ""))
    .filter(Boolean);
}

export function similarity(a: string, b: string): number {
  const x = a.replace(/\s+/g, "");
  const y = b.replace(/\s+/g, "");
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let index = 0; index < x.length - 1; index += 1) {
    const pair = x.slice(index, index + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  let shared = 0;
  for (let index = 0; index < y.length - 1; index += 1) {
    const pair = y.slice(index, index + 2);
    const left = counts.get(pair) ?? 0;
    if (left > 0) {
      shared += 1;
      counts.set(pair, left - 1);
    }
  }
  return (2 * shared) / (x.length - 1 + (y.length - 1));
}

export function languageOf(text: string): string | null {
  const lower = text.toLowerCase();
  for (const word of LANGUAGE_WORDS) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return word;
  }
  return null;
}

function packagingless(title: string): string {
  const kept = title.replace(BRACKETS, (group) => (VERSION_ONE.test(group) ? ` ${group.slice(1, -1)} ` : " "));
  return kept
    .replace(TAIL, (tail) => (VERSION_ONE.test(tail) ? ` ${tail.replace(LEADING_TAIL, "")} ` : ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function searchQueries(target: ImportSong): string[] {
  const firstArtist = target.artist.split(FIRST_ARTIST)[0]?.trim() ?? "";
  const queries = [`${packagingless(target.title)} ${firstArtist}`.trim(), target.title.trim()];
  return [...new Set(queries.filter(Boolean))];
}

export function matchScore(target: ImportSong, song: SearchSong, prefer: MatchLanguage): number | null {
  if (song.isVideo) return null;
  if (versionMarks(target.title) !== versionMarks(song.title)) return null;

  const sim = similarity(titleWords(target.title), titleWords(song.title));
  if (sim < MIN_TITLE_SIMILARITY) return null;

  const gap = target.duration > 0 && song.duration > 0 ? Math.abs(target.duration - song.duration) : null;
  if (gap !== null && gap > MAX_LENGTH_GAP) return null;

  const wanted = artistNames(target.artist);
  const credited = artistNames(song.artist);
  const shared = wanted.filter((name) => credited.includes(name)).length;
  if (wanted.length > 0 && credited.length > 0 && shared === 0) return null;

  let score = sim * 100 + (shared > 0 ? 30 + 10 * (shared / wanted.length) : 0);
  if (gap !== null && gap <= 3) score += 20;
  else if (gap !== null && gap <= 8) score += 10;

  const targetAlbum = titleWords(target.album ?? "");
  if (targetAlbum && targetAlbum === titleWords(song.album ?? "")) score += 10;

  const lang = languageOf(`${target.title} ${target.album ?? ""}`) ?? (prefer || null);
  if (lang) {
    const songLang = languageOf(`${song.title} ${song.album ?? ""}`);
    if (songLang === lang) score += 15;
    else if (songLang !== null) score -= 40;
  }
  return score;
}

export function bestMatch(target: ImportSong, candidates: SearchSong[], prefer: MatchLanguage): SearchSong | null {
  let best: SearchSong | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    if (!candidate.id) continue;
    const score = matchScore(target, candidate, prefer);
    if (score !== null && score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function matchCacheKey(song: ImportSong, prefer: MatchLanguage): string {
  const base = song.spotifyId
    ? `sp:${song.spotifyId}`
    : `t:${song.title}|${song.artist}|${song.duration}`;
  const key = base.toLowerCase();
  return prefer ? `${key}|${prefer}` : key;
}

export async function matchSong(song: ImportSong, preferred: string): Promise<SearchSong | null> {
  const prefer: MatchLanguage = isMatchLanguage(preferred) ? preferred : "";
  await loadMatchCache();
  const key = matchCacheKey(song, prefer);
  const remembered = readMatch(key);
  if (remembered !== undefined && !remembered?.isVideo) return remembered;

  for (const query of searchQueries(song)) {
    const page = await searchPage(query, "songs");
    const candidates = page.rows.flatMap((row) => {
      if (row.kind === "track") return [row.track];
      if (row.kind === "top") return [row.song];
      return [];
    });
    const hit = bestMatch(song, candidates, prefer);
    if (hit) {
      writeMatch(key, hit);
      return hit;
    }
  }
  writeMatch(key, null);
  return null;
}
