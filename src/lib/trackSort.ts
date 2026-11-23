export type SortField = "title" | "artist" | "album" | "duration" | "added";
export type SortDirection = "asc" | "desc";
export type TrackSort = { field: SortField | "custom"; direction: SortDirection; then: SortField | null };
export type SortableTrack = { title: string; artist: string; album?: string | null; duration?: number; addedAt?: number };

export const CUSTOM_SORT: TrackSort = { field: "custom", direction: "asc", then: null };
export const LOCAL_DEFAULT_SORT: TrackSort = { field: "title", direction: "asc", then: null };
export const TRACK_FIELDS: SortField[] = ["title", "artist", "album", "duration", "added"];
export const LOCAL_FIELDS: SortField[] = ["title", "artist", "album", "duration"];
export const ALBUM_FIELDS: SortField[] = ["title", "artist", "duration"];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function fieldLabel(field: SortField): string {
  switch (field) {
    case "title":
      return "Title";
    case "artist":
      return "Artist";
    case "album":
      return "Album";
    case "duration":
      return "Duration";
    case "added":
      return "Date added";
  }
}

export function defaultDirection(field: SortField): SortDirection {
  return field === "added" ? "desc" : "asc";
}

export function directionLabel(field: SortField, direction: SortDirection): string {
  if (field === "duration") return direction === "asc" ? "Shortest first" : "Longest first";
  if (field === "added") return direction === "asc" ? "Oldest first" : "Newest first";
  return direction === "asc" ? "A to Z" : "Z to A";
}

export function sortSummary(sort: TrackSort, customLabel = "Custom order"): string {
  if (sort.field === "custom") return customLabel;
  return sort.then ? `${fieldLabel(sort.field)}, then ${fieldLabel(sort.then)}` : fieldLabel(sort.field);
}

function textOf(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

function positiveOf(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function valueOf(track: SortableTrack, field: SortField): string | number | undefined {
  switch (field) {
    case "title":
      return textOf(track.title);
    case "artist":
      return textOf(track.artist);
    case "album":
      return textOf(track.album);
    case "duration":
      return positiveOf(track.duration);
    case "added":
      return positiveOf(track.addedAt);
  }
}

function compareField(field: SortField, direction: SortDirection, a: SortableTrack, b: SortableTrack): number {
  const x = valueOf(a, field);
  const y = valueOf(b, field);
  if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
  const diff = typeof x === "number" && typeof y === "number" ? x - y : collator.compare(String(x), String(y));
  return direction === "desc" ? -diff : diff;
}

export function trackComparator(sort: TrackSort): (a: SortableTrack, b: SortableTrack) => number {
  if (sort.field === "custom") return () => 0;
  const { field, direction, then } = sort;
  return (a, b) => compareField(field, direction, a, b) || (then ? compareField(then, direction, a, b) : 0);
}

export function sortTracksBy<T extends SortableTrack>(tracks: T[], sort: TrackSort): T[] {
  return [...tracks].sort(trackComparator(sort));
}
