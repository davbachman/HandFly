import { describe, expect, test } from "vitest";
import { computeHandInputFromLandmarks } from "./handMath";
import type { HandLandmark } from "../types";

function makeOpenHand(overrides: Partial<Record<number, Partial<HandLandmark>>> = {}): HandLandmark[] {
  const points = Array.from({ length: 21 }, (_, i) => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: i,
  }));

  Object.assign(points[0], { x: 0.5, y: 0.72, z: 0.02 });
  Object.assign(points[4], { x: 0.28, y: 0.5, z: 0 });
  Object.assign(points[5], { x: 0.4, y: 0.58, z: 0 });
  Object.assign(points[8], { x: 0.38, y: 0.26, z: -0.08 });
  Object.assign(points[9], { x: 0.47, y: 0.56, z: 0 });
  Object.assign(points[12], { x: 0.48, y: 0.21, z: -0.09 });
  Object.assign(points[13], { x: 0.52, y: 0.54, z: 0.01 });
  Object.assign(points[16], { x: 0.52, y: 0.48, z: -0.22 });
  Object.assign(points[17], { x: 0.6, y: 0.57, z: 0 });
  Object.assign(points[20], { x: 0.72, y: 0.5, z: 0 });

  for (const [index, value] of Object.entries(overrides)) {
    Object.assign(points[Number(index)], value);
  }

  return points;
}

describe("computeHandInputFromLandmarks", () => {
  test("maps a level open hand to neutral roll and pitch", () => {
    const input = computeHandInputFromLandmarks(makeOpenHand(), 1000);

    expect(input.tracked).toBe(true);
    expect(input.openHand).toBe(true);
    expect(input.confidence).toBeGreaterThan(0.8);
    expect(input.roll).toBeCloseTo(0, 2);
    expect(input.pitch).toBeCloseTo(0, 2);
  });

  test("maps thumb-to-pinky clockwise tilt to positive roll", () => {
    const input = computeHandInputFromLandmarks(
      makeOpenHand({
        4: { x: 0.3, y: 0.42 },
        20: { x: 0.7, y: 0.58 },
      }),
      1000,
    );

    expect(input.openHand).toBe(true);
    expect(input.roll).toBeGreaterThan(0.25);
  });

  test("maps ring finger screen rotation to positive climb pitch", () => {
    const input = computeHandInputFromLandmarks(
      makeOpenHand({
        13: { x: 0.52, y: 0.55, z: 0 },
        16: { x: 0.52, y: 0.43, z: -0.16 },
      }),
      1000,
    );

    expect(input.openHand).toBe(true);
    expect(input.pitch).toBeGreaterThan(0.35);
  });

  test("rejects closed hand geometry even when landmarks are present", () => {
    const input = computeHandInputFromLandmarks(
      makeOpenHand({
        8: { x: 0.47, y: 0.62 },
        12: { x: 0.49, y: 0.63 },
        16: { x: 0.52, y: 0.63, z: 0 },
        20: { x: 0.56, y: 0.62 },
      }),
      1000,
    );

    expect(input.tracked).toBe(true);
    expect(input.openHand).toBe(false);
    expect(input.confidence).toBeLessThan(0.5);
  });
});

