import type { TKey } from "./i18n";

export type MusicServerDraft = { url: string; username: string; password: string };

export function isPlainHttp(address: string): boolean {
  return /^http:\/\//i.test(address.trim());
}

export function validateMusicServer(draft: MusicServerDraft): TKey | null {
  const address = draft.url.trim();
  if (!address) return "network.error.address";
  const withScheme = address.includes("://") ? address : `https://${address}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return "network.error.address";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "network.error.scheme";
  if (!parsed.hostname) return "network.error.address";
  if (!draft.username.trim() || !draft.password) return "network.error.login";
  return null;
}
