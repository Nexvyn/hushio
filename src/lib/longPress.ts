import { type Point, pressMoved } from "./touchGesture";

export const LONG_PRESS_MS = 300;
export const LONG_PRESS_SLOP_DP = 5;

export class LongPress {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private origin: Point | null = null;

  constructor(
    private readonly onFire: () => void,
    private readonly delayMs: number = LONG_PRESS_MS,
    private readonly slopDp: number = LONG_PRESS_SLOP_DP,
  ) {}

  get pending(): boolean {
    return this.timer !== null;
  }

  start(point: Point): void {
    this.cancel();
    this.origin = point;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.origin = null;
      this.onFire();
    }, this.delayMs);
  }

  move(point: Point): boolean {
    if (this.origin === null || !pressMoved(this.origin, point, this.slopDp)) return false;
    this.cancel();
    return true;
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.origin = null;
  }
}
