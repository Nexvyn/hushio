const WINDOW_MS = 80;
const STALE_MS = 100;

export class VelocityTracker {
  private samples: { t: number; v: number }[] = [];

  reset(t: number, v: number): void {
    this.samples = [{ t, v }];
  }

  add(t: number, v: number): void {
    const last = this.samples[this.samples.length - 1];
    if (last && last.t === t) last.v = v;
    else this.samples.push({ t, v });
    while (this.samples.length > 2 && this.samples[0].t < t - WINDOW_MS) this.samples.shift();
  }

  velocity(now: number): number {
    const s = this.samples;
    if (s.length < 2) return 0;
    const last = s[s.length - 1];
    if (now - last.t > STALE_MS) return 0;
    const first = s[0];
    const dt = last.t - first.t;
    return dt > 0 ? ((last.v - first.v) / dt) * 1000 : 0;
  }
}
