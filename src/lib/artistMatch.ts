const ARTIST_SPLIT = /\s*(?:,|&|;|\/|\+| x | feat\.? | ft\.? | and | with )\s*/i;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export function artistNamesOf(credit: string): string[] {
  return credit.split(ARTIST_SPLIT).map(normalizeName).filter((name) => name.length > 0);
}

export function isByArtist(
  track: { artist: string; artistId?: string | null },
  artist: { id: string; name: string },
): boolean {
  if (track.artistId && track.artistId === artist.id) return true;
  const target = normalizeName(artist.name);
  return target.length > 0 && artistNamesOf(track.artist).includes(target);
}
