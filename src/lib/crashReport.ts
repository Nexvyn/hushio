import { crashReport } from "./bridge";

const WINDOW_MS = 60_000;
const LIMIT = 5;
const FRAME_LINES = 4;

export function createThrottle(limit: number, windowMs: number): (now?: number) => boolean {
  let stamps: number[] = [];
  return (now = Date.now()) => {
    stamps = stamps.filter((at) => now - at < windowMs);
    if (stamps.length >= limit) return false;
    stamps.push(now);
    return true;
  };
}

const allow = createThrottle(LIMIT, WINDOW_MS);

export function formatCrash(value: unknown): string {
  if (value instanceof Error) {
    const frames = (value.stack ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("at ") || line.includes("@"))
      .slice(0, FRAME_LINES);
    return [`${value.name}: ${value.message}`, ...frames].join("\n");
  }
  return String(value);
}

export function reportCrash(value: unknown): void {
  try {
    if (!allow()) return;
    crashReport(formatCrash(value)).catch(() => undefined);
  } catch {
    return;
  }
}

export function installCrashReporting(target: Window = window): () => void {
  const onError = (event: Event) => {
    if (!(event instanceof ErrorEvent)) return;
    reportCrash(event.error ?? event.message);
  };
  const onRejection = (event: Event) => {
    reportCrash((event as Event & { reason?: unknown }).reason);
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
