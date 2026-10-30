import { fileSrc, localLibraryTrackPath, pathExists, registerStreamUrl, streamProxyPort } from "./bridge";
import { downloadedPath } from "./downloads";
import { isLocalId } from "./localLibrary";
import { resolveStream } from "./resolveStream";
import { clampCrossfadeSeconds, useSettings } from "../stores/settings";
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
const AUTOMIX_FALLBACK_S = 6;
const MIN_BLEND_MS = 500;
const ARM_LEAD_MS = 4000;
const ARM_FLOOR_MS = 250;
const FADE_TICK_MS = 25;
const LATE_WAKE_S = 0.03;
const DECK_EVENTS = ["play", "pause", "playing", "waiting", "timeupdate", "durationchange", "ended"] as const;

export type EqSettings = { enabled: boolean; gains: readonly number[]; autoHeadroom: boolean };

export type BlendTarget = { id: string; title: string; index: number };
export type BlendEnd = { position: number; duration: number; ended: boolean };
export type BlendHooks = {
  upNext: () => BlendTarget | null;
  onComplete: (target: BlendTarget, end: BlendEnd) => void;
};

type Song = { id: string; title: string };
type Graph = { ctx: AudioContext; bands: BiquadFilterNode[]; preGain: GainNode };
type Armed = {
  fromId: string;
  toId: string;
  ready: Promise<string | null>;
  timer: ReturnType<typeof setTimeout>;
};
type Fade = {
  fromId: string;
  toId: string;
  startTs: number;
  durMs: number;
  pausedAt: number | null;
  timer: ReturnType<typeof setInterval>;
};

function createDeck(): HTMLAudioElement {
  const deck = new Audio();
  deck.preload = "auto";
  deck.crossOrigin = "anonymous";
  return deck;
}

const decks = [createDeck(), createDeck()];
let mainIndex = 0;
let song: Song | null = null;
let wantPlaying = false;
let loadSeq = 0;
let pendingSeek = 0;
let retryCount = 0;
let retriedAt = Number.NEGATIVE_INFINITY;
let graph: Graph | null = null;
let volume = 1;
let curve = { out: 1, incoming: 0 };
let armed: Armed | null = null;
let fade: Fade | null = null;
let failedBlend: { fromId: string; toId: string } | null = null;
let blendHooks: BlendHooks | null = null;

export function activeDeck(): HTMLAudioElement {
  return decks[mainIndex];
}

export function standbyDeck(): HTMLAudioElement {
  return decks[1 - mainIndex];
}

class Playback extends EventTarget {
  get currentTime(): number {
    return activeDeck().currentTime;
  }

  get duration(): number {
    return activeDeck().duration;
  }

  get playbackRate(): number {
    return activeDeck().playbackRate;
  }
}

export const audio = new Playback();

for (const deck of decks) {
  for (const type of DECK_EVENTS) {
    deck.addEventListener(type, () => {
      if (deck === activeDeck()) audio.dispatchEvent(new Event(type));
    });
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  for (const deck of decks) ctx.createMediaElementSource(deck).connect(bands[0]);
  const chain: AudioNode[] = [...bands, preGain, limiter, makeup, ctx.destination];
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

function refreshVolumes(): void {
  activeDeck().volume = volume * curve.out;
  standbyDeck().volume = volume * curve.incoming;
}

export function setVolume(value: number): void {
  if (!Number.isFinite(value)) return;
  volume = clamp(value, 0, 1);
  refreshVolumes();
}

export function setMuted(value: boolean): void {
  for (const deck of decks) deck.muted = value;
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

async function sourceFor(id: string, refresh: boolean): Promise<string> {
  if (isLocalId(id)) return localSource(id);
  return (await savedSource(id)) ?? streamSource(id, refresh);
}

async function streamSource(id: string, refresh: boolean): Promise<string> {
  const stream = await resolveStream(id, refresh);
  const port = await streamProxyPort();
  await registerStreamUrl(id, stream.url);
  return `http://127.0.0.1:${port}/?id=${encodeURIComponent(id)}`;
}

async function loadStream(id: string, refresh: boolean, seq: number): Promise<void> {
  const src = await sourceFor(id, refresh);
  if (seq !== loadSeq) return;
  activeDeck().src = src;
  if (pendingSeek > 0) activeDeck().currentTime = pendingSeek;
  pendingSeek = 0;
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

async function startPlayback(seq: number): Promise<void> {
  if (seq !== loadSeq || !wantPlaying) return;
  try {
    await activeDeck().play();
  } catch (error) {
    if (isAbort(error)) return;
    await onFailure(seq);
  }
}

async function onFailure(seq: number): Promise<void> {
  const current = song;
  if (!current || !wantPlaying || seq !== loadSeq) return;
  const at = activeDeck().currentTime > 1 ? activeDeck().currentTime : pendingSeek;
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
  activeDeck().pause();
  useUI.getState().toast(`Couldn't play "${current.title}"`, "error");
}

export async function playStream(id: string, title: string): Promise<void> {
  abortBlend();
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
  if (fade) resumeFade(fade);
  await startPlayback(loadSeq);
}

export function pause(): void {
  wantPlaying = false;
  if (fade) freezeFade(fade);
  else abortBlend();
  activeDeck().pause();
}

export function getPlaybackPosition(): number {
  return activeDeck().currentTime;
}

export function seekTo(seconds: number): void {
  if (!Number.isFinite(seconds)) return;
  abortBlend();
  const deck = activeDeck();
  const end = Number.isFinite(deck.duration) && deck.duration > 0 ? deck.duration : seconds;
  deck.currentTime = Math.max(0, Math.min(seconds, end));
}

export function setBlendHooks(hooks: BlendHooks): void {
  blendHooks = hooks;
}

function fadeMsForNext(): number {
  const { crossfadeSeconds, smartFade, reduceAnimation } = useSettings.getState();
  if (reduceAnimation) return 0;
  const seconds = clampCrossfadeSeconds(crossfadeSeconds);
  const fallback = smartFade ? AUTOMIX_FALLBACK_S : 0;
  return Math.round((seconds || fallback) * 1000);
}

function maybeArm(): void {
  if (!wantPlaying || armed || fade) return;
  const fadeMs = fadeMsForNext();
  if (fadeMs < MIN_BLEND_MS) return;
  const current = song;
  const next = blendHooks?.upNext() ?? null;
  if (!current || !next || next.id === current.id) return;
  if (failedBlend?.fromId !== current.id) failedBlend = null;
  if (failedBlend?.toId === next.id) return;
  const deck = activeDeck();
  if (!Number.isFinite(deck.duration) || deck.duration <= 0) return;
  const remainingMs = (deck.duration - deck.currentTime) * 1000;
  if (remainingMs <= ARM_FLOOR_MS || remainingMs > fadeMs + ARM_LEAD_MS) return;
  arm(current.id, next, fadeMs, remainingMs);
}

function arm(fromId: string, next: BlendTarget, fadeMs: number, remainingMs: number): void {
  const waitMs = Math.max(0, remainingMs - fadeMs) / (activeDeck().playbackRate || 1);
  const pending: Armed = {
    fromId,
    toId: next.id,
    ready: sourceFor(next.id, false).then(
      (src) => {
        if (armed === pending) standbyDeck().src = src;
        return src;
      },
      (error: unknown) => {
        console.warn(`[hushio] blend source failed: ${describeError(error)}`);
        return null;
      },
    ),
    timer: setTimeout(() => void beginFade(pending, fadeMs), waitMs),
  };
  armed = pending;
}

async function beginFade(pending: Armed, fadeMs: number): Promise<void> {
  const src = await pending.ready;
  if (armed !== pending) return;
  if (src === null) {
    armed = null;
    return;
  }
  if (blendHooks?.upNext()?.id !== pending.toId) {
    abortBlend();
    return;
  }
  const outgoing = activeDeck();
  const incoming = standbyDeck();
  const lateS = outgoing.currentTime - (outgoing.duration - fadeMs / 1000);
  incoming.currentTime = lateS > LATE_WAKE_S ? lateS : 0;
  armed = null;
  fade = {
    fromId: pending.fromId,
    toId: pending.toId,
    startTs: Date.now(),
    durMs: fadeMs,
    pausedAt: null,
    timer: setInterval(tick, FADE_TICK_MS),
  };
  curve = { out: 1, incoming: 0 };
  refreshVolumes();
  playIncoming();
  tick();
}

function tick(): void {
  const current = fade;
  if (!current) return;
  if (blendHooks?.upNext()?.id !== current.toId) {
    abortBlend();
    return;
  }
  if (standbyDeck().ended && current.pausedAt === null) {
    completeBlend(true);
    return;
  }
  const clock = current.pausedAt ?? Date.now();
  const progress = clamp((clock - current.startTs) / current.durMs, 0, 1);
  const theta = (progress * Math.PI) / 2;
  curve = { out: Math.cos(theta), incoming: Math.sin(theta) };
  refreshVolumes();
  if (progress >= 1 && current.pausedAt === null) completeBlend(false);
}

function completeBlend(ended: boolean): void {
  const finished = fade;
  const target = blendHooks?.upNext() ?? null;
  if (!finished || !target || target.id !== finished.toId) {
    abortBlend();
    return;
  }
  clearInterval(finished.timer);
  fade = null;
  const outgoing = activeDeck();
  const incoming = standbyDeck();
  mainIndex = 1 - mainIndex;
  song = { id: target.id, title: target.title };
  retryCount = 0;
  retriedAt = Number.NEGATIVE_INFINITY;
  outgoing.pause();
  outgoing.removeAttribute("src");
  curve = { out: 1, incoming: 0 };
  refreshVolumes();
  const duration = Number.isFinite(incoming.duration) ? incoming.duration : 0;
  const limit = duration > 0 ? duration : Number.POSITIVE_INFINITY;
  const position = clamp(Number.isFinite(incoming.currentTime) ? incoming.currentTime : 0, 0, limit);
  blendHooks?.onComplete(target, { position, duration, ended });
}

function freezeFade(current: Fade): void {
  if (current.pausedAt !== null) return;
  current.pausedAt = Date.now();
  standbyDeck().pause();
}

function resumeFade(current: Fade): void {
  if (current.pausedAt === null) return;
  current.startTs += Date.now() - current.pausedAt;
  current.pausedAt = null;
  playIncoming();
}

function playIncoming(): void {
  standbyDeck()
    .play()
    .catch((error: unknown) => {
      if (!isAbort(error)) failBlend();
    });
}

function failBlend(): void {
  if (fade) failedBlend = { fromId: fade.fromId, toId: fade.toId };
  abortBlend();
}

function abortBlend(): void {
  if (armed) {
    clearTimeout(armed.timer);
    armed = null;
    standbyDeck().removeAttribute("src");
  }
  if (!fade) return;
  clearInterval(fade.timer);
  fade = null;
  standbyDeck().pause();
  standbyDeck().removeAttribute("src");
  curve = { out: 1, incoming: 0 };
  refreshVolumes();
}

for (const deck of decks) {
  deck.addEventListener("error", () => {
    if (deck === activeDeck()) void onFailure(loadSeq);
    else failBlend();
  });
  deck.addEventListener("timeupdate", () => {
    if (deck === activeDeck()) maybeArm();
  });
  deck.addEventListener("playing", () => {
    if (graph?.ctx.state === "suspended") void graph.ctx.resume();
  });
}
