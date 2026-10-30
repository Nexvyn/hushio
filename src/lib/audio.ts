import {
  fileSrc,
  localLibraryTrackPath,
  pathExists,
  registerStreamUrl,
  streamProxyPort,
  trackAnalysis,
  type TrackAnalysis,
} from "./bridge";
import { downloadedPath } from "./downloads";
import { EQ_BANDS_HZ } from "./eq";
import { isLocalId } from "./localLibrary";
import { analysable, Leveling, Lru } from "./loudness";
import { headTrimTarget, TRIM_MIN_S, tailReached } from "./playbackEdges";
import { resolveStream } from "./resolveStream";
import { clampCrossfadeSeconds, useSettings, type SettingsValues } from "../stores/settings";
import { useUI } from "../stores/ui";

export const TEST_SONG_ID = "dQw4w9WgXcQ";
export const TEST_SONG_TITLE = "Test song";

const EQ_Q = 1.41;
const SINK_RETRY_MS = 300;
const LIMIT_THRESHOLD_DB = -0.5;
const LIMIT_RATIO = 20;
const LIMIT_ATTACK_S = 0.002;
const LIMIT_RELEASE_S = 0.15;
const RETRY_WINDOW_S = 30;
const PEAK_SAMPLES = 96;
const PEAK_MIN_HZ = 20;
const PEAK_MAX_HZ = 20000;
const NO_GAINS = EQ_BANDS_HZ.map(() => 0);
const AUTOMIX_FALLBACK_S = 6;
const MIN_BLEND_MS = 500;
const ARM_LEAD_MS = 4000;
const ARM_FLOOR_MS = 250;
const FADE_TICK_MS = 25;
const LEVEL_TICK_MS = 25;
const SILENCE_POLL_MS = 500;
const LATE_WAKE_S = 0.03;
const ANALYSIS_LIMIT = 400;
const DECK_EVENTS = ["play", "pause", "playing", "waiting", "timeupdate", "durationchange", "ended"] as const;

export type EqSettings = { enabled: boolean; gains: readonly number[]; autoHeadroom: boolean };

export type BlendTarget = { id: string; title: string; index: number };
export type BlendEnd = { position: number; duration: number; ended: boolean };
export type BlendHooks = {
  upNext: () => BlendTarget | null;
  onComplete: (target: BlendTarget, end: BlendEnd) => void;
};

type Song = { id: string; title: string };
type Source = { src: string; analysis: string; lufs: number | null };
type Graph = { ctx: AudioContext; bands: BiquadFilterNode[]; preGain: GainNode };
type Armed = {
  fromId: string;
  toId: string;
  ready: Promise<Source | null>;
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
let eqState: EqSettings = { enabled: false, gains: NO_GAINS, autoHeadroom: true };
let eqPeakDb = 0;
const deckIds: (string | undefined)[] = [undefined, undefined];
const deckSources: (string | undefined)[] = [undefined, undefined];
const leveling = new Leveling(() => useSettings.getState().loudnessLevel);
const analyses = new Lru<TrackAnalysis>(ANALYSIS_LIMIT);
const analysing = new Set<string>();
let levelTimer: ReturnType<typeof setInterval> | null = null;
let silenceTimer: ReturnType<typeof setInterval> | null = null;

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
  if (index === EQ_BANDS_HZ.length - 1) return "highshelf";
  return "peaking";
}

function eqResponsePeakDb(ctx: AudioContext, gains: readonly number[]): number {
  if (!gains.some((gain) => gain > 0)) return 0;
  const top = Math.min(PEAK_MAX_HZ, ctx.sampleRate / 2 - 1);
  const frequencies = new Float32Array(PEAK_SAMPLES).map(
    (_, i) => PEAK_MIN_HZ * (top / PEAK_MIN_HZ) ** (i / (PEAK_SAMPLES - 1)),
  );
  const total = new Float64Array(PEAK_SAMPLES);
  EQ_BANDS_HZ.forEach((hz, index) => {
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
  const bands = EQ_BANDS_HZ.map((hz, index) => {
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

export function applyEq(next: EqSettings): void {
  eqState = next;
  if (!graph && next.enabled) graph = buildGraph();
  if (!graph) return;
  const { ctx, bands } = graph;
  if (ctx.state === "suspended") void ctx.resume();
  const active = next.enabled ? next.gains : NO_GAINS;
  const now = ctx.currentTime;
  bands.forEach((band, index) => band.gain.setTargetAtTime(active[index] ?? 0, now, 0.02));
  eqPeakDb = eqResponsePeakDb(ctx, active);
  updateHeadroom(Date.now());
}

function updateHeadroom(now: number): void {
  if (!graph) return;
  const level = clamp(volume * leveling.gainOf(deckIds[mainIndex], now), 0, 1);
  const db = eqState.enabled && eqState.autoHeadroom ? headroomDb(eqPeakDb, level) : 0;
  graph.preGain.gain.setTargetAtTime(dbToGain(-db), graph.ctx.currentTime, 0.05);
}

function refreshVolumes(): void {
  const now = Date.now();
  activeDeck().volume = clamp(volume * curve.out * leveling.gainOf(deckIds[mainIndex], now), 0, 1);
  standbyDeck().volume = clamp(volume * curve.incoming * leveling.gainOf(deckIds[1 - mainIndex], now), 0, 1);
  updateHeadroom(now);
}

function startLevelTimer(): void {
  if (levelTimer !== null) return;
  levelTimer = setInterval(() => {
    leveling.tick(Date.now());
    refreshVolumes();
    if (!leveling.gliding()) stopLevelTimer();
  }, LEVEL_TICK_MS);
}

function stopLevelTimer(): void {
  if (levelTimer === null) return;
  clearInterval(levelTimer);
  levelTimer = null;
}

function noteLoudness(id: string, lufs: number): void {
  const heard =
    wantPlaying && (deckIds[mainIndex] === id || fade?.toId === id) && activeDeck().currentTime > 0;
  leveling.setLoudness(id, lufs, heard, Date.now());
  refreshVolumes();
  if (leveling.gliding()) startLevelTimer();
}

function applySpeed(): void {
  const rate = useSettings.getState().playbackSpeed || 1;
  for (const deck of decks) {
    deck.playbackRate = rate;
    deck.preservesPitch = true;
  }
}

export function setVolume(value: number): void {
  if (!Number.isFinite(value)) return;
  volume = clamp(value, 0, 1);
  refreshVolumes();
}

export function setMuted(value: boolean): void {
  for (const deck of decks) deck.muted = value;
}

type SinkRouted = { sinkId?: string; setSinkId(sinkId: string): Promise<void> };

function hasSinkRouting(node: object): node is SinkRouted {
  return "setSinkId" in node && typeof node.setSinkId === "function";
}

async function trySink(node: SinkRouted, sinkId: string): Promise<boolean> {
  try {
    await node.setSinkId(sinkId);
    return true;
  } catch (error) {
    console.warn(`[hushio] setSinkId("${sinkId}") failed: ${describeError(error)}`);
    return false;
  }
}

async function routeSink(node: SinkRouted, sinkId: string): Promise<void> {
  if (await trySink(node, sinkId)) return;
  if (sinkId === "") return;
  await new Promise((resolve) => setTimeout(resolve, SINK_RETRY_MS));
  if (await trySink(node, sinkId)) return;
  await trySink(node, "");
}

function sinkOf(node: SinkRouted): string {
  return node.sinkId ?? "";
}

export function applySink(sinkId: string): void {
  if (graph) {
    if (hasSinkRouting(graph.ctx) && sinkOf(graph.ctx) !== sinkId) void routeSink(graph.ctx, sinkId);
    return;
  }
  for (const deck of decks) {
    if (hasSinkRouting(deck) && sinkOf(deck) !== sinkId) void routeSink(deck, sinkId);
  }
}

function resumeGraph(): void {
  if (graph?.ctx.state === "suspended") void graph.ctx.resume();
}

for (const type of ["pointerdown", "keydown"] as const) {
  window.addEventListener(type, resumeGraph, true);
}

function eqSettingsOf(state: SettingsValues): EqSettings {
  return { enabled: state.eqEnabled, gains: state.eqGains, autoHeadroom: state.eqAutoHeadroom };
}

function analysisOf(id: string | undefined): TrackAnalysis | undefined {
  return id === undefined ? undefined : analyses.get(id);
}

function blendEdges(): boolean {
  const { skipSilence, smartFade } = useSettings.getState();
  return skipSilence || smartFade;
}

function edgeOf(id: string | undefined, side: "head" | "tail"): number {
  if (!blendEdges()) return 0;
  return analysisOf(id)?.[side] ?? 0;
}

function trimHead(id: string | undefined): void {
  if (!useSettings.getState().skipSilence) return;
  const target = headTrimTarget(analysisOf(id)?.head ?? 0, activeDeck().currentTime);
  if (target !== null) activeDeck().currentTime = target;
}

function armSilence(): void {
  disarmSilence();
  if (!useSettings.getState().skipSilence) return;
  if (!((analysisOf(deckIds[mainIndex])?.tail ?? 0) > TRIM_MIN_S)) return;
  silenceTimer = setInterval(checkTail, SILENCE_POLL_MS);
}

function disarmSilence(): void {
  if (silenceTimer === null) return;
  clearInterval(silenceTimer);
  silenceTimer = null;
}

function checkTail(): void {
  if (!wantPlaying || fade) return;
  const deck = activeDeck();
  if (!tailReached(deck.currentTime, deck.duration, analysisOf(deckIds[mainIndex])?.tail ?? 0)) return;
  disarmSilence();
  audio.dispatchEvent(new Event("ended"));
}

async function savedSource(id: string): Promise<Source | null> {
  const path = downloadedPath(id);
  if (!path) return null;
  const exists = await pathExists(path).catch(() => false);
  return exists ? { src: fileSrc(path), analysis: path, lufs: null } : null;
}

async function localSource(id: string): Promise<Source> {
  const path = await localLibraryTrackPath(id);
  if (!path) throw new Error(`Local file is not in the library: ${id}`);
  return { src: fileSrc(path), analysis: path, lufs: null };
}

async function sourceFor(id: string, refresh: boolean): Promise<Source> {
  if (isLocalId(id)) return localSource(id);
  return (await savedSource(id)) ?? streamSource(id, refresh);
}

async function streamSource(id: string, refresh: boolean): Promise<Source> {
  const stream = await resolveStream(id, refresh);
  const port = await streamProxyPort();
  await registerStreamUrl(id, stream.url);
  const url = `http://127.0.0.1:${port}/?id=${encodeURIComponent(id)}`;
  return { src: url, analysis: url, lufs: stream.lufs };
}

async function loadStream(id: string, refresh: boolean, seq: number): Promise<void> {
  const source = await sourceFor(id, refresh);
  if (seq !== loadSeq) return;
  deckIds[mainIndex] = id;
  deckSources[mainIndex] = source.analysis;
  activeDeck().src = source.src;
  applySpeed();
  if (source.lufs !== null) noteLoudness(id, source.lufs);
  else refreshVolumes();
  if (pendingSeek > 0) activeDeck().currentTime = pendingSeek;
  else trimHead(id);
  pendingSeek = 0;
  armSilence();
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
  disarmSilence();
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
  disarmSilence();
  const deck = activeDeck();
  const end = Number.isFinite(deck.duration) && deck.duration > 0 ? deck.duration : seconds;
  deck.currentTime = Math.max(0, Math.min(seconds, end));
  armSilence();
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
  const rate = deck.playbackRate || 1;
  const remainingMs = ((deck.duration - edgeOf(current.id, "tail") - deck.currentTime) * 1000) / rate;
  if (remainingMs <= ARM_FLOOR_MS || remainingMs > fadeMs + ARM_LEAD_MS) return;
  arm(current.id, next, fadeMs, remainingMs);
}

function arm(fromId: string, next: BlendTarget, fadeMs: number, remainingMs: number): void {
  const waitMs = Math.max(0, remainingMs - fadeMs);
  const pending: Armed = {
    fromId,
    toId: next.id,
    ready: sourceFor(next.id, false).then(
      (source) => {
        if (armed === pending) {
          const standby = 1 - mainIndex;
          standbyDeck().src = source.src;
          deckIds[standby] = next.id;
          deckSources[standby] = source.analysis;
          applySpeed();
          if (source.lufs !== null) noteLoudness(next.id, source.lufs);
        }
        return source;
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
  const source = await pending.ready;
  if (armed !== pending) return;
  if (source === null) {
    armed = null;
    return;
  }
  if (blendHooks?.upNext()?.id !== pending.toId) {
    abortBlend();
    return;
  }
  const outgoing = activeDeck();
  const incoming = standbyDeck();
  const rate = outgoing.playbackRate || 1;
  const outAt = outgoing.duration - edgeOf(pending.fromId, "tail") - (fadeMs / 1000) * rate;
  const late = outgoing.currentTime - outAt;
  incoming.currentTime = edgeOf(pending.toId, "head") + (late > LATE_WAKE_S ? late : 0);
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
  armSilence();
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
    deckIds[1 - mainIndex] = undefined;
  }
  if (!fade) return;
  clearInterval(fade.timer);
  fade = null;
  standbyDeck().pause();
  standbyDeck().removeAttribute("src");
  deckIds[1 - mainIndex] = undefined;
  curve = { out: 1, incoming: 0 };
  refreshVolumes();
}

async function analyseDeck(index: number): Promise<void> {
  const id = deckIds[index];
  const source = deckSources[index];
  const deck = decks[index];
  if (id === undefined || source === undefined || analyses.has(id) || analysing.has(id)) return;
  if (!analysable(deck.duration)) return;
  const { skipSilence, smartFade, loudnessLevel } = useSettings.getState();
  const needsLufs = loudnessLevel !== "off" && !leveling.known(id);
  if (!skipSilence && !smartFade && !needsLufs) return;
  analysing.add(id);
  try {
    const result = await trackAnalysis(source);
    analyses.set(id, result);
    if (result.lufs !== null && !leveling.known(id)) noteLoudness(id, result.lufs);
    if (deckIds[mainIndex] === id) {
      trimHead(id);
      armSilence();
    }
  } catch (error) {
    console.warn(`[hushio] analysis failed: ${describeError(error)}`);
  } finally {
    analysing.delete(id);
  }
}

for (const [index, deck] of decks.entries()) {
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
  deck.addEventListener("durationchange", () => void analyseDeck(index));
}

useSettings.subscribe((state, previous) => {
  if (state.playbackSpeed !== previous.playbackSpeed) applySpeed();
  if (state.loudnessLevel !== previous.loudnessLevel) {
    leveling.clearGlides();
    stopLevelTimer();
    refreshVolumes();
  }
  if (state.skipSilence !== previous.skipSilence) {
    if (state.skipSilence) armSilence();
    else disarmSilence();
  }
  if (
    state.eqEnabled !== previous.eqEnabled ||
    state.eqGains !== previous.eqGains ||
    state.eqAutoHeadroom !== previous.eqAutoHeadroom
  ) {
    applyEq(eqSettingsOf(state));
  }
  if (state.audioSinkId !== previous.audioSinkId) applySink(state.audioSinkId);
});

applySpeed();
applyEq(eqSettingsOf(useSettings.getState()));
applySink(useSettings.getState().audioSinkId);
