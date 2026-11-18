export function nowPlayingSourceName(
  from: string | null,
  album: string | undefined,
  playlistName: (id: string) => string | undefined,
): string {
  if (from === null || from.trim() === "") return (album ?? "").trim();
  if (from === "__liked__") return "Liked Songs";
  if (from === "__downloads__") return "Downloads";
  const name = playlistName(from);
  if (typeof name === "string" && name.trim() !== "") return name;
  return from;
}
