export const MOOD_CATEGORY = "moods_and_genres_category";
export const MOOD_BROWSE_ID = `FEmusic_${MOOD_CATEGORY}`;
export const DEFAULT_TONE = "#5b4bd6";
export const PODCASTS_COLOR = "#6d5dfc";
const DEFAULT_SECTION = "Moods & genres";

export type MoodEntry = {
  title: string;
  browseId: string;
  params: string | null;
  color: string | null;
  section: string | null;
};

export type MoodGroup = { title: string; moods: MoodEntry[] };

function neutral(title: string, color: string): MoodEntry {
  return { title, browseId: "", params: null, color, section: null };
}

export const FALLBACK_MOODS: MoodEntry[] = [
  neutral("Today's hits", "#E13300"),
  neutral("Lo-fi beats", "#4B2AAD"),
  neutral("Workout energy", "#D00000"),
  neutral("Focus flow", "#023E8A"),
  neutral("Rock classics", "#370617"),
  neutral("Jazz evenings", "#2B2D42"),
  neutral("Pop hits", "#C9184A"),
  neutral("Chill mix", "#2D6A4F"),
];

export function tone(color: string | null): string {
  return color ?? DEFAULT_TONE;
}

export function moodByParams(moods: readonly MoodEntry[], params: string): MoodEntry | undefined {
  return moods.find((mood) => mood.params === params);
}

export function bySection(moods: readonly MoodEntry[]): MoodGroup[] {
  const groups = new Map<string, MoodEntry[]>();
  for (const mood of moods) {
    const title = mood.section ?? DEFAULT_SECTION;
    groups.set(title, [...(groups.get(title) ?? []), mood]);
  }
  return [...groups].map(([title, members]) => ({ title, moods: members }));
}
