export function playFailedMessage(title: string): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "You're offline. Connect to play this song.";
  return `Couldn't play "${title}"`;
}
