import { fetch as pluginFetch } from "@tauri-apps/plugin-http";

type FetchInput = Parameters<typeof pluginFetch>[0];

function urlOf(input: FetchInput): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

export const ytFetch: typeof pluginFetch = (input, init) => {
  const url = new URL(urlOf(input));
  if (!url.hostname.endsWith("youtube.com")) return pluginFetch(input, init);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  headers.set("origin", url.origin);
  return pluginFetch(input, { ...init, headers });
};
