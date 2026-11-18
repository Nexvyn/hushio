import { describe, expect, it } from "vitest";
import { landsPast, projectDistance, rubberBand, rubberBandEdge } from "./gesturePhysics";

describe("projectDistance", () => {
  it("projects a flick forward along its direction", () => {
    expect(projectDistance(1000)).toBeCloseTo(499, 0);
    expect(projectDistance(-1000)).toBeCloseTo(-499, 0);
    expect(projectDistance(0)).toBe(0);
  });
});

describe("landsPast", () => {
  it("commits when the drag itself passes the threshold", () => {
    expect(landsPast(-50, 0, 50)).toBe(true);
    expect(landsPast(-49, 0, 50)).toBe(false);
  });

  it("commits a short drag that a fast flick carries past the threshold", () => {
    expect(landsPast(20, 900, 120)).toBe(true);
    expect(landsPast(20, 100, 120)).toBe(false);
  });

  it("does not commit when a fast flick back carries the drag the other way", () => {
    expect(landsPast(100, -2000, 50)).toBe(false);
    expect(landsPast(20, -900, 120)).toBe(false);
  });
});

describe("rubberBand", () => {
  it("follows small pulls closely and barely moves at large pulls", () => {
    const small = rubberBand(20, 800);
    const large = rubberBand(400, 800);
    expect(small).toBeGreaterThan(9);
    expect(small).toBeLessThan(12);
    expect(large).toBeLessThan(400 * 0.5);
    expect(large).toBeLessThan(800);
  });

  it("is symmetric and keeps the sign", () => {
    expect(rubberBand(-120, 800)).toBeCloseTo(-rubberBand(120, 800));
    expect(rubberBand(0, 800)).toBe(0);
  });

  it("never passes the dimension", () => {
    expect(Math.abs(rubberBand(100000, 800))).toBeLessThan(800);
  });
});

describe("rubberBandEdge", () => {
  it("leaves positions past the edge on the free side unchanged", () => {
    expect(rubberBandEdge(150, 800)).toBe(150);
  });

  it("resists only past the top edge", () => {
    expect(rubberBandEdge(-100, 800)).toBeLessThan(0);
    expect(rubberBandEdge(-100, 800)).toBeGreaterThan(-100);
  });
});
