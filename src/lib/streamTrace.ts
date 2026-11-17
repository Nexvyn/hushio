const FLAG = "hushio.debugStream";

let origin = 0;

export function traceOn(): boolean {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function traceMark(label: string, detail = ""): void {
  const now = performance.now();
  if (label === "tap") origin = now;
  if (!traceOn()) return;
  console.debug(`[hushio:stream] ${label} +${Math.round(now - origin)}ms${detail ? ` ${detail}` : ""}`);
}
