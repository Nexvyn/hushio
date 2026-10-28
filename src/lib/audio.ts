import { fileSrc, localLibraryTrackPath, pathExists, registerStreamUrl, streamProxyPort } from "./bridge";
import { downloadedPath } from "./downloads";
import { isLocalId } from "./localLibrary";
import { resolveStream } from "./resolveStream";
import { useUI } from "../stores/ui";

export const TEST_SONG_ID = "dQw4w9WgXcQ";
export const TEST_SONG_TITLE = "Test song";

const EQ_BAND_HZ = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const EQ_Q = 1.41;
const LIMIT_THRESHOLD_DB = -0.5;
const LIMIT_RATIO = 20;
const LIMIT_ATTACK_S = 0.002;
const LIMIT_RELEASE_S = 0.15;
const TRACK_LEVEL = 1;
const RETRY_WINDOW_S = 30;
const PEAK_SAMPLES = 96;
const PEAK_MIN_HZ = 20;
const PEAK_MAX_HZ = 20000;
const NO_GAINS = EQ_BAND_HZ.map(() => 0);

export type EqSettings = { enabled: boolean; gains: readonly number[]; autoHeadroom: boolean };

type Song = { id: string; title: string };
type Graph = { ctx: AudioContext; bands: BiquadFilterNode[]; preGain: GainNode };

export const audio = new Audio();
audio.preload = "auto";
audio.crossOrigin = "anonymous";

let song: Song | null = null;
let wantPlaying = false;
let loadSeq = 0;
let pendingSeek = 0;
let retryCount = 0;
let retriedAt = Number.NEGATIVE_INFINITY;
let graph: Graph | null = null;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function compressorMakeupDb(threshold: number, ratio: number): number {
  return -0.6 * (threshold + (0 - threshold) / ratio);
}

export function headroomDb(peakDb: number, level: number): number {
  if (!(level > 0) || !Number.isFinite(peakDb) || peakDb <= 0) return 0;
  return Math.max(0, peakDb + 20 * Math.log10(Math.min(1, level)));
}

function bandType(index: number): BiquadFilterType {
  if (index === 0) return "lowshelf";
  if (index === EQ_BAND_HZ.length - 1) return "highshelf";
  return "peaking";
}

function eqResponsePeakDb(ctx: AudioContext, gains: readonly number[]): number {
  if (!gains.some((gain) => gain > 0)) return 0;
  const top = Math.min(PEAK_MAX_HZ, ctx.sampleRate / 2 - 1);
  const frequencies = new Float32Array(PEAK_SAMPLES).map(
    (_, i) => PEAK_MIN_HZ * (top / PEAK_MIN_HZ) ** (i / (PEAK_SAMPLES - 1)),
  );
  const total = new Float64Array(PEAK_SAMPLES);
  EQ_BAND_HZ.forEach((hz, index) => {
    const filter = ctx.createBiquadFilter();
    filter.type = bandType(index);
    filter.frequency.value = hz;
    filter.Q.value = EQ_Q;
    filter.gain.value = gains[index] ?? 0;
    const magnitude = new Float32Array(PEAK_SAMPLES);
    filter.getFrequencyResponse(frequencies, magnitude, new Float32Array(PEAK_SAMPLES));
    magnitude.forEach((value, k) => {
      total[k] += 20 * Math.log10(Math.max(1e-6, Math.abs(value)));
    });
  });
  const peak = Math.max(...total);
  return Number.isFinite(peak) ? Math.max(0, peak) : 0;
}

function buildGraph(): Graph {
  const ctx = new AudioContext();
  const source = ctx.createMediaElementSource(audio);
  const bands = EQ_BAND_HZ.map((hz, index) => {
    const filter = ctx.createBiquadFilter();
    filter.type = bandType(index);
    filter.frequency.value = hz;
    filter.Q.value = EQ_Q;
    return filter;
  });
  const preGain = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMIT_THRESHOLD_DB;
  limiter.knee.value = 0;
  limiter.ratio.value = LIMIT_RATIO;
  limiter.attack.value = LIMIT_ATTACK_S;
  limiter.release.value = LIMIT_RELEASE_S;
  const makeup = ctx.createGain();
  makeup.gain.value = dbToGain(-compressorMakeupDb(LIMIT_THRESHOLD_DB, LIMIT_RATIO));
  const chain: AudioNode[] = [source, ...bands, preGain, limiter, makeup, ctx.destination];
  for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  return { ctx, bands, preGain };
}

export function applyEq({ enabled, gains, autoHeadroom }: EqSettings): void {
  if (!graph && enabled) graph = buildGraph();
  if (!graph) return;
  const { ctx, bands, preGain } = graph;
  if (ctx.state === "suspended") void ctx.resume();
  const active = enabled ? gains : NO_GAINS;
  const now = ctx.currentTime;
  bands.forEach((band, index) => band.gain.setTargetAtTime(active[index] ?? 0, now, 0.02));
  const headroom = enabled && autoHeadroom ? headroomDb(eqResponsePeakDb(ctx, active), TRACK_LEVEL) : 0;
  preGain.gain.setTargetAtTime(dbToGain(-headroom), now, 0.05);
}

export function setVolume(value: number): void {
  if (!Number.isFinite(value)) return;
  audio.volume = Math.min(1, Math.max(0, value));
}

export function setMuted(value: boolean): void {
  audio.muted = value;
}

async function savedSource(id: string): Promise<string | null> {
  const path = downloadedPath(id);
  if (!path) return null;
  const exists = await pathExists(path).catch(() => false);
  return exists ? fileSrc(path) : null;
}

async function localSource(id: string): Promise<string> {
  const path = await localLibraryTrackPath(id);
  if (!path) throw new Error(`Local file is not in the library: ${id}`);
  return fileSrc(path);
}

async function streamSource(id: string, refresh: boolean): Promise<string> {
  const stream = await resolveStream(id, refresh);
  const port = await streamProxyPort();
  await registerStreamUrl(id, stream.url);
  return `http://127.0.0.1:${port}/?id=${encodeURIComponent(id)}`;
}

async function loadStream(id: string, refresh: boolean, seq: number): Promise<void> {
  const src = isLocalId(id)
    ? await localSource(id)
    : ((await savedSource(id)) ?? (await streamSource(id, refresh)));
  if (seq !== loadSeq) return;
  audio.src = src;
  if (pendingSeek > 0) audio.currentTime = pendingSeek;
  pendingSeek = 0;
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function startPlayback(seq: number): Promise<void> {
  if (seq !== loadSeq || !wantPlaying) return;
  try {
    await audio.play();
  } catch (error) {
    if (isAbort(error)) return;
    await onFailure(seq);
  }
}

async function onFailure(seq: number): Promise<void> {
  const current = song;
  if (!current || !wantPlaying || seq !== loadSeq) return;
  const at = audio.currentTime > 1 ? audio.currentTime : pendingSeek;
  if (retryCount === 0 || at - retriedAt > RETRY_WINDOW_S) {
    retryCount += 1;
    retriedAt = at;
    pendingSeek = at;
    const retrySeq = ++loadSeq;
    try {
      await loadStream(current.id, true, retrySeq);
    } catch (error) {
      console.warn(`[hushio] source retry failed: ${describeError(error)}`);
      await onFailure(retrySeq);
      return;
    }
    await startPlayback(retrySeq);
    return;
  }
  wantPlaying = false;
  audio.pause();
  useUI.getState().toast(`Couldn't play "${current.title}"`, "error");
}

export async function playStream(id: string, title: string): Promise<void> {
  song = { id, title };
  wantPlaying = true;
  pendingSeek = 0;
  retryCount = 0;
  retriedAt = Number.NEGATIVE_INFINITY;
  const seq = ++loadSeq;
  await loadStream(id, false, seq);
  await startPlayback(seq);
}

export async function play(): Promise<void> {
  if (!song) return;
  wantPlaying = true;
  await startPlayback(loadSeq);
}

export function pause(): void {
  wantPlaying = false;
  audio.pause();
}

export function getPlaybackPosition(): number {
  return audio.currentTime;
}

export function seekTo(seconds: number): void {
  if (!Number.isFinite(seconds)) return;
  const end = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seconds;
  audio.currentTime = Math.max(0, Math.min(seconds, end));
}

audio.addEventListener("error", () => {
  void onFailure(loadSeq);
});

audio.addEventListener("playing", () => {
  if (graph?.ctx.state === "suspended") void graph.ctx.resume();
});
