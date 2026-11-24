import type { SettingsCategory } from "./categories";

function includes(text: string | undefined, needle: string) {
  return text?.toLowerCase().includes(needle) ?? false;
}

export function filterCategories(categories: SettingsCategory[], query: string): SettingsCategory[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return categories;

  return categories.flatMap((category) => {
    if (includes(category.label, needle)) return [category];

    const groups = category.groups.flatMap((group) => {
      if (includes(group.title, needle)) return [group];
      const rows = group.rows.filter((row) =>
        [row.title, row.note, row.value, ...(row.searchTerms ?? [])].some((text) => includes(text, needle)),
      );
      return rows.length > 0 ? [{ ...group, rows }] : [];
    });

    return groups.length > 0 ? [{ ...category, groups }] : [];
  });
}
