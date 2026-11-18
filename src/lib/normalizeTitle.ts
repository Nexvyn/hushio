const SUFFIX = /\s+-\s+.*\b(remaster(ed)?|live|official|lyrics?|version|edit|mix|mono|stereo|deluxe|radio|explicit|clean|demo)\b.*$/i;
const BRACKETS = /\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g;

export function normalizeTitle(title: string): string {
  return title
    .replace(BRACKETS, " ")
    .replace(SUFFIX, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
