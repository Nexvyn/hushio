import { fetch } from "@tauri-apps/plugin-http";
import { APP_NAME } from "./app";
import { clip, durationOf, MAX_SONGS, type ImportSong } from "./importParse";

const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
const MS_PER_DAY = 86_400_000;
const EMBED_URL = "https://open.spotify.com/embed/playlist";
const QUERY_URL = "https://api-partner.spotify.com/pathfinder/v2/query";
const FETCH_PLAYLIST_HASH = "21ea11a6ac75a5f3e01fd365d29c18e0a4a8b7dc09f89bbb5d73910190c6acaf";
const ID = /^[A-Za-z0-9]{22}$/;
const SHORT_LINK = /^https:\/\/spotify\.link\/[A-Za-z0-9]{6,20}\/?$/;
const EMBED_DATA = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;
const OPEN_LINK = /https:\/\/open\.spotify\.com\/[^\s"'<>]+/;
const PRIVATE_TEXT = "That playlist is private or no longer exists.";
const NOT_A_LINK = "That isn't a link to a Spotify playlist.";
const CHANGED_TEXT = `Spotify changed something, so ${APP_NAME} couldn't read it. Try again later.`;
const DEFAULT_NAME = "Spotify playlist";

export type PublicPlaylist = {
  name: string;
  owner?: string;
  thumb: string | null;
  songs: ImportSong[];
  total: number;
};

type Json = Record<string, unknown>;
type EmbedPlaylist = PublicPlaylist & { token: string | null };

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function lastSegment(uri: string): string {
  return uri.split(":").pop() ?? "";
}

function imagesOf(sources: unknown): { url: string; width: number }[] {
  if (!Array.isArray(sources)) return [];
  return sources
    .filter(isRecord)
    .map((source) => ({ url: textOf(source.url), width: Number(source.width) || 0 }))
    .filter((source) => source.url);
}

function largestImage(sources: unknown): string | null {
  const ranked = imagesOf(sources).sort((a, b) => b.width - a.width);
  return ranked[0]?.url ?? null;
}

function coverOf(sources: unknown): string | null {
  const ranked = imagesOf(sources).sort((a, b) => a.width - b.width);
  return (ranked.find((image) => image.width >= 300) ?? ranked.at(-1))?.url ?? null;
}

export function isSpotifyShortLink(text: string): boolean {
  return SHORT_LINK.test(text.trim());
}

export function spotifyPlaylistId(link: string): string | null {
  const text = link.trim();
  const uri = /^spotify:(?:user:[^:]+:)?playlist:([A-Za-z0-9]{22})$/i.exec(text);
  if (uri) return uri[1];

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (host !== "spotify.com" && !host.endsWith(".spotify.com")) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments[0] && /^intl-[a-z]{2}$/i.test(segments[0])) segments.shift();
  const [kind, id] = segments;
  return kind === "playlist" && id && ID.test(id) ? id : null;
}

export function songOf(data: unknown, uri?: string): ImportSong | null {
  if (!isRecord(data)) return null;
  const spotifyId = lastSegment(textOf(uri) || textOf(data.uri));
  const title = clip(textOf(data.name).trim());
  if (!title || !spotifyId) return null;

  const artists = isRecord(data.artists) && Array.isArray(data.artists.items) ? data.artists.items : [];
  const artist = clip(
    artists
      .map((item) => (isRecord(item) && isRecord(item.profile) ? textOf(item.profile.name) : ""))
      .filter(Boolean)
      .join(", "),
  );
  const album = isRecord(data.albumOfTrack) ? clip(textOf(data.albumOfTrack.name)) : "";
  const durationSource = isRecord(data.trackDuration) ? data.trackDuration : data.duration;
  const ms = isRecord(durationSource) ? Number(durationSource.totalMilliseconds) : 0;
  const cover =
    isRecord(data.albumOfTrack) && isRecord(data.albumOfTrack.coverArt)
      ? coverOf(data.albumOfTrack.coverArt.sources)
      : null;
  const explicit = isRecord(data.contentRating) && data.contentRating.label === "EXPLICIT";

  return {
    spotifyId,
    title,
    artist,
    ...(album ? { album } : {}),
    duration: ms > 0 && ms < MS_PER_DAY ? durationOf(ms / 1000) : 0,
    thumb: cover,
    explicit,
  };
}

export function parseEmbedPage(html: string): EmbedPlaylist {
  const match = EMBED_DATA.exec(html);
  let data: unknown = null;
  try {
    data = match ? JSON.parse(match[1]) : null;
  } catch {
    data = null;
  }
  const pageProps = isRecord(data) && isRecord(data.props) ? data.props.pageProps : null;
  const state = isRecord(pageProps) && isRecord(pageProps.state) ? pageProps.state : null;
  const entity = state && isRecord(state.data) && isRecord(state.data.entity) ? state.data.entity : null;
  if (!entity) throw new Error(PRIVATE_TEXT);

  const rows = Array.isArray(entity.trackList) ? entity.trackList : [];
  const songs: ImportSong[] = [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const title = clip(textOf(row.title).trim());
    if (!title) continue;
    songs.push({
      spotifyId: lastSegment(textOf(row.uri)),
      title,
      artist: clip(textOf(row.subtitle)),
      duration: durationOf(Number(row.duration) / 1000),
      explicit: row.isExplicit === true,
    });
  }
  const session = isRecord(state?.settings) && isRecord(state.settings.session) ? state.settings.session : null;

  return {
    name: textOf(entity.name) || textOf(entity.title) || DEFAULT_NAME,
    owner: textOf(entity.subtitle) || undefined,
    thumb: largestImage(isRecord(entity.coverArt) ? entity.coverArt.sources : null),
    songs: songs.slice(0, MAX_SONGS),
    total: songs.length,
    token: session && textOf(session.accessToken) ? textOf(session.accessToken) : null,
  };
}

function timeout(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function httpError(status: number): Error {
  return new Error(`Spotify didn't answer (HTTP ${status}). Try again in a moment.`);
}

async function resolveShortLink(link: string): Promise<string> {
  const response = await fetch(link, { method: "GET", redirect: "manual", signal: timeout() });
  const location = response.headers.get("location");
  if (location) return location;
  return OPEN_LINK.exec(await response.text())?.[0] ?? "";
}

async function embedFor(id: string): Promise<EmbedPlaylist> {
  const response = await fetch(`${EMBED_URL}/${id}`, { method: "GET", signal: timeout() });
  if (response.status === 404) throw new Error(PRIVATE_TEXT);
  if (!response.ok) throw httpError(response.status);
  return parseEmbedPage(await response.text());
}

type PlaylistPage = { name: string; owner?: string; thumb: string | null; total: number; items: ImportSong[] };

function playlistPageOf(data: unknown): PlaylistPage | null {
  if (!isRecord(data) || !isRecord(data.playlistV2)) return null;
  const playlist = data.playlistV2;
  const content = isRecord(playlist.content) ? playlist.content : {};
  const rawItems = Array.isArray(content.items) ? content.items : [];
  const items: ImportSong[] = [];
  for (const entry of rawItems) {
    if (!isRecord(entry) || !isRecord(entry.itemV2) || !isRecord(entry.itemV2.data)) continue;
    const track = entry.itemV2.data;
    if (track.__typename !== "Track") continue;
    const song = songOf(track);
    if (song) items.push(song);
  }
  const owner =
    isRecord(playlist.ownerV2) && isRecord(playlist.ownerV2.data) ? textOf(playlist.ownerV2.data.name) : "";
  const images = isRecord(playlist.images) && Array.isArray(playlist.images.items) ? playlist.images.items : [];
  const first = isRecord(images[0]) ? images[0] : null;
  return {
    name: textOf(playlist.name) || DEFAULT_NAME,
    owner: owner || undefined,
    thumb: largestImage(first ? first.sources : null),
    total: Number(content.totalCount) || items.length,
    items,
  };
}

async function fetchPage(id: string, token: string, offset: number): Promise<PlaylistPage> {
  const response = await fetch(QUERY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json;charset=UTF-8",
      "App-Platform": "WebPlayer",
    },
    body: JSON.stringify({
      variables: { uri: `spotify:playlist:${id}`, offset, limit: PAGE_SIZE, enableWatchFeedEntrypoint: false },
      operationName: "fetchPlaylist",
      extensions: { persistedQuery: { version: 1, sha256Hash: FETCH_PLAYLIST_HASH } },
    }),
    signal: timeout(),
  });
  if (!response.ok) throw httpError(response.status);
  const body: unknown = await response.json();
  const page = playlistPageOf(isRecord(body) ? body.data : null);
  if (!page) throw new Error(CHANGED_TEXT);
  return page;
}

async function readAllSongs(id: string, token: string): Promise<PublicPlaylist> {
  const first = await fetchPage(id, token, 0);
  const songs = [...first.items];
  const limit = Math.min(first.total, MAX_SONGS);
  for (let offset = PAGE_SIZE; offset < limit; offset += PAGE_SIZE) {
    const page = await fetchPage(id, token, offset);
    if (page.items.length === 0) break;
    songs.push(...page.items);
  }
  return {
    name: first.name,
    owner: first.owner,
    thumb: first.thumb,
    songs: songs.slice(0, MAX_SONGS),
    total: limit,
  };
}

export async function readPublicPlaylist(link: string): Promise<PublicPlaylist> {
  const target = isSpotifyShortLink(link) ? await resolveShortLink(link.trim()) : link;
  const id = spotifyPlaylistId(target);
  if (!id) throw new Error(NOT_A_LINK);

  const { token, ...embed } = await embedFor(id);
  if (!token) return embed;
  try {
    const full = await readAllSongs(id, token);
    return { ...full, thumb: full.thumb ?? embed.thumb };
  } catch (error) {
    console.warn(`[hushio] full playlist read failed, keeping the embed songs: ${String(error)}`);
    return embed;
  }
}
