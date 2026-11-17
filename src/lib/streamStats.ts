import type { ResolvedStream } from "./resolveStream";

export type StatsSource = "Stream" | "Download" | "Local file" | "Network folder" | "JioSaavn" | `Add-on: ${string}`;

export type StreamDetails = {
  mime: string | null;
  kbps: number | null;
  sampleRate: number | null;
  channels: number | null;
  itag: number | null;
  clen: number | null;
  lufs: number | null;
  source: StatsSource;
};

export type StatsRow = { label: string; value: string };

const NO_VALUE = "—";

const CODECS_PARAM = /codecs="?([^";]+)/i;

const EXTENSION_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: 'audio/ogg; codecs="opus"',
  wav: "audio/wav",
  webm: "audio/webm",
};

export function codecName(mime: string | null | undefined): string {
  if (!mime) return NO_VALUE;
  const codecs = CODECS_PARAM.exec(mime)?.[1]?.toLowerCase() ?? "";
  if (codecs.startsWith("opus")) return "Opus";
  if (codecs.startsWith("mp4a")) return "AAC";
  if (codecs.startsWith("flac")) return "FLAC";
  if (codecs.startsWith("mp3")) return "MP3";
  if (codecs.startsWith("vorbis")) return "Vorbis";
  if (codecs.startsWith("alac")) return "ALAC";
  const type = mime.split(";")[0].trim().toLowerCase();
  if (type === "audio/webm") return "Opus";
  if (type === "audio/mp4" || type === "audio/m4a" || type === "audio/x-m4a") return "AAC";
  if (type === "audio/mpeg" || type === "audio/mp3") return "MP3";
  if (type === "audio/flac" || type === "audio/x-flac") return "FLAC";
  return NO_VALUE;
}

export function mimeFromPath(path: string): string | null {
  const extension = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  return extension ? (EXTENSION_MIME[extension] ?? null) : null;
}

export function formatKbps(kbps: number | null | undefined): string {
  return kbps == null ? NO_VALUE : `${Math.round(kbps)} kbps`;
}

export function formatKhz(hz: number | null | undefined): string {
  return hz == null ? NO_VALUE : `${Number((hz / 1000).toFixed(2))} kHz`;
}

export function formatChannels(channels: number | null | undefined): string {
  if (channels == null) return NO_VALUE;
  if (channels === 1) return "Mono";
  if (channels === 2) return "Stereo";
  return `${channels} channels`;
}

export function formatMb(bytes: number | null | undefined): string {
  return bytes == null ? NO_VALUE : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function formatLufs(lufs: number | null | undefined): string {
  return lufs == null ? NO_VALUE : `${lufs.toFixed(1)} LUFS`;
}

export function streamDetails(stream: ResolvedStream, source: StatsSource): StreamDetails {
  return {
    mime: stream.mime,
    kbps: stream.kbps ?? null,
    sampleRate: stream.sampleRate ?? null,
    channels: stream.channels ?? null,
    itag: stream.itag ?? null,
    clen: stream.clen ?? null,
    lufs: stream.lufs,
    source,
  };
}

export function fileDetails(path: string, source: StatsSource): StreamDetails {
  return {
    mime: mimeFromPath(path),
    kbps: null,
    sampleRate: null,
    channels: null,
    itag: null,
    clen: null,
    lufs: null,
    source,
  };
}

export function statsRows(details: StreamDetails | null): StatsRow[] {
  return [
    { label: "Codec", value: codecName(details?.mime) },
    { label: "Bitrate", value: formatKbps(details?.kbps) },
    { label: "Sample rate", value: formatKhz(details?.sampleRate) },
    { label: "Channels", value: formatChannels(details?.channels) },
    { label: "Format id", value: details?.itag == null ? NO_VALUE : String(details.itag) },
    { label: "Size", value: formatMb(details?.clen) },
    { label: "Source", value: details?.source ?? NO_VALUE },
    { label: "Loudness", value: formatLufs(details?.lufs) },
  ];
}
