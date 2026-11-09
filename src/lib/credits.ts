const COMMA_GAP = /\s*,\s*/g;
const SPACES = /\s+/g;
const HAS_LETTER = /\p{L}/u;

function titleWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function normalizeCredit(value: string): string {
  const spaced = value.replace(COMMA_GAP, ", ").replace(SPACES, " ").trim();
  if (!HAS_LETTER.test(spaced) || spaced !== spaced.toUpperCase()) return spaced;
  return spaced.split(" ").map(titleWord).join(" ");
}
