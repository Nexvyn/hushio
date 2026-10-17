export const SWIPE_LIFT_MS = 140;

const SWIPE_GAP_MS = 300;
const FIRST_PX = 150;
const CHROME_SHARE = 0.3;
const CHROME_MIN_PX = 180;
const AXIS_PX = 8;
const COAST_RUN = 5;

export type SwipeDir = "back" | "forward";

export type SwipeUpdate =
  | { kind: "track"; dir: SwipeDir; progress: number }
  | { kind: "commit"; dir: SwipeDir }
  | { kind: "cancel" }
  | null;

export type SwipeWheel = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  timeStamp: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
};

export function swipeLine(width: number) {
  return (FIRST_PX + Math.max(CHROME_MIN_PX, width * CHROME_SHARE)) / 2;
}

export function createSwipeNav(direction: () => number = () => 1) {
  let last = 0;
  let x = 0;
  let y = 0;
  let prev = 0;
  let spent = false;
  let tracking = false;
  let armed = false;
  let coasting = false;
  let run = 0;
  let runFrom = 0;
  let dir: SwipeDir = "back";

  function reset() {
    x = 0;
    y = 0;
    prev = 0;
    spent = false;
    tracking = false;
    armed = false;
    coasting = false;
    run = 0;
    runFrom = 0;
  }

  function wheel(
    event: SwipeWheel,
    scrolls: (dx: number) => boolean,
    can: (dir: SwipeDir) => boolean,
    width: number,
  ): SwipeUpdate {
    if (event.ctrlKey || event.defaultPrevented) return null;
    if (event.timeStamp - last > SWIPE_GAP_MS) reset();
    last = event.timeStamp;
    if (spent) return null;

    const line = event.deltaMode === 1 ? 16 : 1;
    const dx = event.deltaX * line * direction();
    if (!tracking && dx !== 0 && scrolls(dx)) {
      spent = true;
      return null;
    }

    const size = Math.abs(dx);
    const along = dx !== 0 && Math.sign(dx) === Math.sign(x);

    if (coasting) {
      if (!along || size > prev * 1.15) {
        coasting = false;
      } else {
        run += 1;
        if (run >= COAST_RUN) {
          spent = true;
          tracking = false;
          return { kind: "commit", dir };
        }
      }
    }

    if (!coasting) {
      const shrinking = along && size > prev * 0.75 && size < prev * 0.995;
      if (shrinking) {
        if (run === 0) runFrom = x;
        run += 1;
        if (run >= COAST_RUN) {
          x = runFrom;
          coasting = true;
        }
      } else {
        run = 0;
        runFrom = x;
      }
      x += dx;
      y += event.deltaY * line;
    }

    prev = size;
    if (Math.abs(x) + Math.abs(y) < AXIS_PX) return null;
    if (Math.abs(x) <= 1.5 * Math.abs(y)) {
      spent = true;
      return null;
    }

    dir = x < 0 ? "back" : "forward";
    const held = run >= 2 && !coasting ? runFrom : x;
    const progress = can(dir) ? Math.abs(held) / swipeLine(width) : 0;
    armed = progress >= 1;

    if (coasting) {
      if (armed) {
        spent = true;
        tracking = false;
        return { kind: "commit", dir };
      }
      if (!tracking) return null;
      tracking = false;
      return { kind: "cancel" };
    }

    tracking = true;
    return { kind: "track", dir, progress };
  }

  function quiet(now: number): SwipeUpdate {
    if (!tracking || spent || now - last < SWIPE_LIFT_MS) return null;
    tracking = false;
    if (!armed) {
      return { kind: "cancel" };
    }
    spent = true;
    armed = false;
    return { kind: "commit", dir };
  }

  return { wheel, quiet, reset };
}

export function scrollsSideways(target: EventTarget | null, dx: number) {
  let element = target instanceof Element ? target : null;
  while (element) {
    if (element.scrollWidth > element.clientWidth + 1) {
      const overflow = getComputedStyle(element).overflowX;
      if (overflow === "auto" || overflow === "scroll") {
        const max = element.scrollWidth - element.clientWidth;
        if (dx < 0 ? element.scrollLeft > 0 : element.scrollLeft < max - 1) {
          return true;
        }
      }
    }
    element = element.parentElement;
  }
  return false;
}
