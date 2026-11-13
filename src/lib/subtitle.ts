const BULLET = /\s*[•·]\s*/;

export function joinSubtitle(label: string, subtitle: string | null | undefined, separator = " • "): string {
  const segments = [label, ...(subtitle ?? "").split(BULLET)]
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment.toLowerCase() !== "youtube music");
  const parts: string[] = [];
  for (const segment of segments) {
    if (parts[parts.length - 1]?.toLowerCase() !== segment.toLowerCase()) parts.push(segment);
  }
  return parts.join(separator);
}
