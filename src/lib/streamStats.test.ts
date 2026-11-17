import { describe, expect, it } from "vitest";
import {
  codecName,
  fileDetails,
  formatChannels,
  formatKbps,
  formatKhz,
  formatLufs,
  formatMb,
  mimeFromPath,
  statsRows,
  type StreamDetails,
} from "./streamStats";

const FULL: StreamDetails = {
  mime: 'audio/webm; codecs="opus"',
  kbps: 130.4,
  sampleRate: 48000,
  channels: 2,
  itag: 251,
  clen: 4_300_000,
  lufs: -14.02,
  source: "Stream",
};

describe("codecName", () => {
  it("names opus in a webm container", () => {
    expect(codecName('audio/webm; codecs="opus"')).toBe("Opus");
    expect(codecName("audio/webm")).toBe("Opus");
  });

  it("names mp4a and plain mp4 audio as AAC", () => {
    expect(codecName('audio/mp4; codecs="mp4a.40.2"')).toBe("AAC");
    expect(codecName("audio/mp4")).toBe("AAC");
  });

  it("names mp3, flac and other known codecs", () => {
    expect(codecName("audio/mpeg")).toBe("MP3");
    expect(codecName("audio/flac")).toBe("FLAC");
    expect(codecName('audio/ogg; codecs="vorbis"')).toBe("Vorbis");
  });

  it("returns a dash for an unknown or missing mime", () => {
    expect(codecName("application/x-unknown")).toBe("—");
    expect(codecName("audio/ogg")).toBe("—");
    expect(codecName("")).toBe("—");
    expect(codecName(null)).toBe("—");
    expect(codecName(undefined)).toBe("—");
  });
});

describe("number formatting", () => {
  it("rounds bitrate to whole kbps", () => {
    expect(formatKbps(130.4)).toBe("130 kbps");
    expect(formatKbps(128)).toBe("128 kbps");
  });

  it("shows sample rate in kHz without trailing zeros", () => {
    expect(formatKhz(44100)).toBe("44.1 kHz");
    expect(formatKhz(48000)).toBe("48 kHz");
    expect(formatKhz(22050)).toBe("22.05 kHz");
  });

  it("names channel counts", () => {
    expect(formatChannels(1)).toBe("Mono");
    expect(formatChannels(2)).toBe("Stereo");
    expect(formatChannels(6)).toBe("6 channels");
  });

  it("converts bytes to megabytes and loudness to LUFS", () => {
    expect(formatMb(4_300_000)).toBe("4.3 MB");
    expect(formatLufs(-14.02)).toBe("-14.0 LUFS");
  });

  it("returns a dash when a number is missing", () => {
    expect(formatKbps(null)).toBe("—");
    expect(formatKhz(undefined)).toBe("—");
    expect(formatChannels(null)).toBe("—");
    expect(formatMb(null)).toBe("—");
    expect(formatLufs(null)).toBe("—");
  });
});

describe("mimeFromPath", () => {
  it("maps common audio extensions to a mime", () => {
    expect(mimeFromPath("C:/music/track.MP3")).toBe("audio/mpeg");
    expect(mimeFromPath("/music/track.flac")).toBe("audio/flac");
    expect(mimeFromPath("/music/track.m4a")).toBe("audio/mp4");
  });

  it("returns null for an unknown or missing extension", () => {
    expect(mimeFromPath("/music/track.xyz")).toBeNull();
    expect(mimeFromPath("/music/track")).toBeNull();
  });
});

describe("statsRows", () => {
  it("lists every row in order with formatted values", () => {
    expect(statsRows(FULL)).toEqual([
      { label: "Codec", value: "Opus" },
      { label: "Bitrate", value: "130 kbps" },
      { label: "Sample rate", value: "48 kHz" },
      { label: "Channels", value: "Stereo" },
      { label: "Format id", value: "251" },
      { label: "Size", value: "4.3 MB" },
      { label: "Source", value: "Stream" },
      { label: "Loudness", value: "-14.0 LUFS" },
    ]);
  });

  it("shows a dash for every unknown value", () => {
    const rows = statsRows(fileDetails("/music/track.xyz", "Local file"));
    expect(rows.map((row) => row.value)).toEqual(["—", "—", "—", "—", "—", "—", "Local file", "—"]);
  });

  it("shows a dash for every row when nothing is known yet", () => {
    expect(statsRows(null).map((row) => row.value)).toEqual(["—", "—", "—", "—", "—", "—", "—", "—"]);
  });

  it("never mentions the removed service name", () => {
    const text = JSON.stringify(statsRows(FULL)) + JSON.stringify(statsRows(null));
    expect(text).not.toMatch(/YouTube Music/i);
  });
});
