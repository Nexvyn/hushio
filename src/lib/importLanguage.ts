export const MATCH_LANGUAGES = ["telugu", "tamil", "hindi", "kannada", "malayalam", "english"] as const;
export type MatchLanguage = "" | (typeof MATCH_LANGUAGES)[number];

export const MATCH_LANGUAGE_OPTIONS: { value: MatchLanguage; label: string }[] = [
  { value: "", label: "Any" },
  { value: "telugu", label: "Telugu" },
  { value: "tamil", label: "Tamil" },
  { value: "hindi", label: "Hindi" },
  { value: "kannada", label: "Kannada" },
  { value: "malayalam", label: "Malayalam" },
  { value: "english", label: "English" },
];

export function isMatchLanguage(value: unknown): value is MatchLanguage {
  return value === "" || (MATCH_LANGUAGES as readonly unknown[]).includes(value);
}

export function matchLanguageLabel(value: MatchLanguage): string {
  return MATCH_LANGUAGE_OPTIONS.find((option) => option.value === value)?.label ?? "Any";
}
