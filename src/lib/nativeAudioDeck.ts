import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { EXCLUSIVE_UNAVAILABLE } from "./exclusive";

type PlaybackControl =
  | { kind: "pause"; paused: boolean }
  | { kind: "seek"; seconds: number }
  | { kind: "volume"; volume: number }
  | { kind: "mute"; muted: boolean }
  | { kind: "speed"; speed: number }
  | { kind: "outputDevice"; id: string }
  | { kind: "equalizer"; enabled: boolean; gains: readonly number[]; autoHeadroom: boolean }
  | { kind: "exclusive"; enabled: boolean }
  | { kind: "stop" };

type PlaybackSnapshot = {
  timePos: number | null;
  duration: number | null;
  paused: boolean;
  idle: boolean;
  eof: boolean;
  volume: number;
  speed: number;
};

type NativeEvent = { deck: number; generation: number; event: unknown };

async function probeNativeAudio(): Promise<boolean> {
  if (!isTauri() || /Android/.test(navigator.userAgent)) return false;
  try {
    return (await invoke<boolean>("desktop_playback_available")) === true;
  } catch {
    return false;
  }
}

export const usesNativeAudio = await probeNativeAudio();

function objectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

let exclusiveRejected: () => void = () => {};

export function onExclusiveRejected(handler: () => void): void {
  exclusiveRejected = handler;
}

/** A single mpv deck. Source replacement invalidates queued commands and old native events. */
export class NativeAudioDeck extends EventTarget {
  src = "";
  duration = Number.NaN;
  ended = false;
  preservesPitch = true;
  error: { code: number } | null = null;
  networkState = 0;
  readyState = 0;
  sinkId = "";
  private generation = 0;
  private loaded = false;
  private paused = true;
  private position = 0;
  private positionedAt = performance.now();
  private level = 1;
  private rate = 1;
  private silence = false;
  private exclusive = false;
  private queue: Promise<unknown> = Promise.resolve();
  private eq: Extract<PlaybackControl, { kind: "equalizer" }> = {
    kind: "equalizer", enabled: false, gains: Array.from({ length: 10 }, () => 0), autoHeadroom: true,
  };
  private readonly listening: Promise<() => void>;

  constructor(private readonly deck: number) {
    super();
    this.listening = listen<NativeEvent>("desktop-playback-event", ({ payload }) => {
      if (payload.deck !== deck || payload.generation !== this.generation || !this.loaded) return;
      this.acceptEvent(payload.event);
    });
    if (import.meta.hot) import.meta.hot.dispose(() => { void this.listening.then((unlisten) => unlisten()); });
  }

  get currentSrc(): string { return this.src; }
  get currentTime(): number {
    const elapsed = this.paused ? 0 : (performance.now() - this.positionedAt) / 1000 * this.rate;
    const end = Number.isFinite(this.duration) ? this.duration : Number.POSITIVE_INFINITY;
    return Math.min(end, this.position + elapsed);
  }
  set currentTime(value: number) {
    this.setPosition(value);
    this.send({ kind: "seek", seconds: value });
  }
  get volume(): number { return this.level; }
  set volume(value: number) {
    if (this.level === value) return;
    this.level = value;
    this.send({ kind: "volume", volume: value * 100 });
  }
  get muted(): boolean { return this.silence; }
  set muted(value: boolean) { this.silence = value; this.send({ kind: "mute", muted: value }); }
  get playbackRate(): number { return this.rate; }
  set playbackRate(value: number) {
    this.setPosition(this.currentTime);
    this.rate = value;
    this.send({ kind: "speed", speed: value });
  }

  async loadSource(source: string): Promise<void> {
    const generation = ++this.generation;
    this.src = source;
    this.loaded = false;
    this.paused = true;
    this.ended = false;
    this.error = null;
    this.duration = Number.NaN;
    this.setPosition(0);
    this.readyState = 0;
    const operation = this.queue.catch(() => {}).then(async () => {
      await this.listening;
      if (generation !== this.generation) throw new DOMException("Source replaced", "AbortError");
      const load = () => invoke<PlaybackSnapshot>("desktop_playback_load", { deck: this.deck, generation, source });
      const snapshot = await load().catch((error: unknown) => {
        if (!this.exclusive || error !== EXCLUSIVE_UNAVAILABLE) throw error;
        this.exclusive = false;
        exclusiveRejected();
        return load();
      });
      if (generation !== this.generation) throw new DOMException("Source replaced", "AbortError");
      this.loaded = true;
      this.duration = snapshot.duration ?? Number.NaN;
      this.setPosition(snapshot.timePos ?? 0);
      this.readyState = 4;
      this.networkState = 1;
      for (const control of [
        { kind: "volume", volume: this.level * 100 },
        { kind: "mute", muted: this.silence },
        { kind: "speed", speed: this.rate },
        { kind: "outputDevice", id: this.sinkId },
        this.eq,
        ...(this.exclusive ? [{ kind: "exclusive" as const, enabled: true }] : []),
      ] satisfies PlaybackControl[]) {
        await this.control(control, generation);
      }
      this.dispatchEvent(new Event("durationchange"));
    });
    this.queue = operation;
    await operation;
  }

  async play(): Promise<void> {
    const generation = this.generation;
    await this.enqueue({ kind: "pause", paused: false });
    if (generation !== this.generation) return;
    this.paused = false;
    this.ended = false;
    this.positionedAt = performance.now();
    this.dispatchEvent(new Event("play"));
    this.dispatchEvent(new Event("playing"));
  }

  pause(): void {
    this.setPosition(this.currentTime);
    this.paused = true;
    this.send({ kind: "pause", paused: true });
    this.dispatchEvent(new Event("pause"));
  }

  removeAttribute(name: string): void {
    if (name !== "src") return;
    const generation = this.generation;
    this.queue = this.queue.catch(() => {}).then(() => this.control({ kind: "stop" }, generation));
    ++this.generation;
    this.src = "";
    this.loaded = false;
    this.paused = true;
    this.ended = false;
    this.setPosition(0);
  }

  getAttribute(name: string): string | null {
    return name === "src" && this.src ? this.src : null;
  }

  async setSinkId(id: string): Promise<void> {
    this.sinkId = id;
    if (this.loaded) await this.enqueue({ kind: "outputDevice", id });
  }

  setEqualizer(enabled: boolean, gains: readonly number[], autoHeadroom: boolean): void {
    this.eq = { kind: "equalizer", enabled, gains: [...gains], autoHeadroom };
    this.send(this.eq);
  }

  private setPosition(seconds: number): void {
    this.position = Math.max(0, seconds);
    this.positionedAt = performance.now();
  }

  private control(control: PlaybackControl, generation: number): Promise<void> {
    const request = invoke<void>("desktop_playback_control", { deck: this.deck, generation, control });
    if (control.kind !== "exclusive") return request;
    return request.then(() => {}, () => { exclusiveRejected(); });
  }

  setExclusive(enabled: boolean): void {
    this.exclusive = enabled;
    if (this.loaded) void this.enqueue({ kind: "exclusive", enabled });
  }

  private enqueue(control: PlaybackControl): Promise<void> {
    const generation = this.generation;
    const operation = this.queue.catch(() => {}).then(() => {
      if (!this.loaded || generation !== this.generation) return;
      return this.control(control, generation);
    });
    this.queue = operation;
    return operation;
  }

  private send(control: PlaybackControl): void {
    if (!this.loaded) return;
    void this.enqueue(control).catch((error: unknown) => {
      console.warn("[hushio] native audio control failed", error);
    });
  }

  private acceptEvent(event: unknown): void {
    if (!objectValue(event)) return;
    if (event.event === "property-change") {
      if (event.name === "time-pos" && typeof event.data === "number") {
        this.setPosition(event.data);
        this.dispatchEvent(new Event("timeupdate"));
      } else if (event.name === "duration" && typeof event.data === "number") {
        this.duration = event.data;
        this.dispatchEvent(new Event("durationchange"));
      } else if (event.name === "paused-for-cache" && event.data === true) {
        this.dispatchEvent(new Event("waiting"));
      }
    } else if (event.event === "end-file") {
      if (event.reason === "eof") {
        this.ended = true;
        this.paused = true;
        this.dispatchEvent(new Event("ended"));
      } else if (event.reason === "error") {
        this.error = { code: 4 };
        this.dispatchEvent(new Event("error"));
      }
    } else if (event.event === "shutdown") {
      this.error = { code: 2 };
      this.dispatchEvent(new Event("error"));
    } else if (event.event === "playback-restart" && !this.paused) {
      this.dispatchEvent(new Event("playing"));
    }
  }
}
