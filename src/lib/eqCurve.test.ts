import { describe, expect, it } from "vitest";
import { EQ_BANDS_HZ, EQ_RANGE, flatGains } from "./eq";
import {
  bandFraction,
  bandSpoken,
  curveAnchors,
  displayToEngine,
  engineToDisplay,
  EQ_MOODS,
  EQ_Y_PAD,
  eqValueText,
  fractionToGain,
  gainToFraction,
  keyGain,
  lerpGains,
  moodMatching,
  sampleCurve,
  splineSamples,
  type Point,
} from "./eqCurve";

describe("band positions", () => {
  it("puts the first band on the left inset and the last on the right inset", () => {
    expect(bandFraction(0, 7)).toBeCloseTo(0.11);
    expect(bandFraction(6, 7)).toBeCloseTo(0.89);
  });

  it("keeps bands in increasing x order", () => {
    const xs = Array.from({ length: 7 }, (_, index) => bandFraction(index, 7));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });
});

describe("gain to height", () => {
  it("maps +12 to the top, -12 to the bottom and 0 to the middle", () => {
    expect(gainToFraction(EQ_RANGE)).toBeCloseTo(EQ_Y_PAD);
    expect(gainToFraction(-EQ_RANGE)).toBeCloseTo(1 - EQ_Y_PAD);
    expect(gainToFraction(0)).toBeCloseTo(0.5);
  });

  it("round trips every whole dB", () => {
    for (let gain = -EQ_RANGE; gain <= EQ_RANGE; gain++) {
      expect(fractionToGain(gainToFraction(gain))).toBe(gain);
    }
  });

  it("snaps to whole dB and clamps outside the range", () => {
    expect(fractionToGain(-5)).toBe(EQ_RANGE);
    expect(fractionToGain(5)).toBe(-EQ_RANGE);
    expect(fractionToGain(0.5004)).toBe(0);
  });
});

describe("frequency mapping", () => {
  it("samples a curve in log frequency between its points and holds the ends", () => {
    expect(sampleCurve([100, 1000], [0, 10], [50, 100, 1000, 5000])).toEqual([0, 0, 10, 10]);
    expect(sampleCurve([100, 1000], [0, 10], [316.2278])[0]).toBeCloseTo(5, 1);
  });

  it("turns the seven display gains into ten engine gains and back", () => {
    const engine = displayToEngine(EQ_MOODS.Warm);
    expect(engine).toHaveLength(EQ_BANDS_HZ.length);
    expect(engine[0]).toBe(8);
    expect(engine.at(-1)).toBe(-6);
    expect(engineToDisplay(engine)).toHaveLength(7);
  });

  it("keeps Flat exactly flat in both directions", () => {
    expect(displayToEngine(EQ_MOODS.Flat)).toEqual(flatGains());
    expect(engineToDisplay(flatGains())).toEqual(EQ_MOODS.Flat);
  });

  it("names the mood a display curve matches", () => {
    expect(moodMatching(EQ_MOODS.Night)).toBe("Night");
    expect(moodMatching([1, 1, 1, 1, 1, 1, 1])).toBeNull();
  });
});

describe("spline", () => {
  const points: Point[] = [
    { x: 0, y: 10 },
    { x: 50, y: 40 },
    { x: 100, y: 40 },
    { x: 150, y: 90 },
  ];

  it("passes through every control point", () => {
    const samples = splineSamples(points, 8);
    for (const point of points) {
      expect(samples).toContainEqual(point);
    }
  });

  it("does not overshoot the control heights", () => {
    const bumpy: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 30, y: 0 },
    ];
    for (const sample of splineSamples(bumpy, 16)) {
      expect(sample.y).toBeGreaterThanOrEqual(-1e-9);
      expect(sample.y).toBeLessThanOrEqual(10 + 1e-9);
    }
  });

  it("stays monotone between rising control points", () => {
    const rising = splineSamples(points, 10).map((sample) => sample.y);
    for (let i = 1; i < rising.length; i++) {
      expect(rising[i]).toBeGreaterThanOrEqual(rising[i - 1] - 1e-9);
    }
  });

  it("extends the ribbon to both edges", () => {
    const anchors = curveAnchors(points, 300);
    expect(anchors[0]).toEqual({ x: 0, y: 10 });
    expect(anchors.at(-1)).toEqual({ x: 300, y: 90 });
    expect(curveAnchors([], 300)).toEqual([]);
  });
});

describe("preset interpolation", () => {
  it("returns the start and the target at the ends", () => {
    expect(lerpGains([0, 4], [6, -2], 0)).toEqual([0, 4]);
    expect(lerpGains([0, 4], [6, -2], 1)).toEqual([6, -2]);
  });

  it("moves halfway at t 0.5 and clamps t", () => {
    expect(lerpGains([0, 4], [6, -2], 0.5)).toEqual([3, 1]);
    expect(lerpGains([0, 4], [6, -2], 3)).toEqual([6, -2]);
  });

  it("uses the target when the start is missing", () => {
    expect(lerpGains([], [5], 0)).toEqual([5]);
  });
});

describe("keyboard and labels", () => {
  it("steps by 1 dB on arrows, 3 dB on page keys and jumps on Home and End", () => {
    expect(keyGain(2, "ArrowUp")).toBe(3);
    expect(keyGain(2, "ArrowLeft")).toBe(1);
    expect(keyGain(2, "PageUp")).toBe(5);
    expect(keyGain(2, "PageDown")).toBe(-1);
    expect(keyGain(2, "Home")).toBe(-EQ_RANGE);
    expect(keyGain(2, "End")).toBe(EQ_RANGE);
  });

  it("clamps at the range and ignores other keys", () => {
    expect(keyGain(EQ_RANGE, "ArrowUp")).toBe(EQ_RANGE);
    expect(keyGain(-EQ_RANGE, "PageDown")).toBe(-EQ_RANGE);
    expect(keyGain(2, "a")).toBeNull();
  });

  it("speaks the band and the gain", () => {
    expect(bandSpoken(1000)).toBe("1 kHz");
    expect(bandSpoken(2400)).toBe("2.4 kHz");
    expect(bandSpoken(60)).toBe("60 Hz");
    expect(eqValueText(1000, 4)).toBe("+4 dB at 1 kHz");
    expect(eqValueText(14000, -6)).toBe("−6 dB at 14 kHz");
    expect(eqValueText(400, 0)).toBe("0 dB at 400 Hz");
  });
});
