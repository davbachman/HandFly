import { describe, expect, test } from "vitest";
import { computeHandInputFromLandmarks, continuousLineAngle, PITCH_FULL_SCALE, ROLL_FULL_SCALE, shapeAxis } from "./handMath";
import type { HandLandmark } from "../types";

// Fixtures are in raw (non-mirrored) image coordinates: x right, y DOWN,
// z toward the camera is negative. In that space the user's right side is
// on the image's left, and a tilt the user sees as clockwise appears
// counterclockwise here — the same frame MediaPipe reports from a webcam.

interface HandPose {
  // Bank the user perceives, radians; positive = clockwise / bank right.
  roll?: number;
  // Finger elevation, radians; positive = fingers rotated up (climb).
  pitch?: number;
  fist?: boolean;
}

function makeHand(hand: "right" | "left", pose: HandPose = {}): HandLandmark[] {
  const { roll = 0, pitch = 0, fist = false } = pose;
  const center = { x: 0.5, y: 0.5 };
  // Mirror across x for the left hand: thumb side flips.
  const side = hand === "right" ? 1 : -1;

  const points: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const put = (index: number, dx: number, dy: number, z: number): void => {
    points[index] = { x: center.x + side * dx, y: center.y + dy, z };
  };

  // Level open hand, palm down, fingers pointing at the camera.
  // For a right hand in raw image space the thumb sits at HIGHER x than the
  // pinky — the exact layout that used to saturate atan2 at +-pi.
  put(0, 0, 0.13, 0.02); // wrist
  put(4, 0.16, -0.02, -0.03); // thumb tip, level with the pinky tip
  put(5, 0.08, -0.02, -0.05); // index mcp
  put(9, 0.03, -0.025, -0.05); // middle mcp
  put(13, -0.025, -0.025, -0.05); // ring mcp
  put(17, -0.08, -0.02, -0.045); // pinky mcp

  // Finger tips extend from their knuckles toward the camera, rotated up by
  // the pitch angle. A fist curls them back near the palm instead.
  const fingers: Array<{ tip: number; mcp: number; length: number; splay: number }> = [
    { tip: 8, mcp: 5, length: 0.1, splay: 0.02 },
    { tip: 12, mcp: 9, length: 0.12, splay: 0 },
    { tip: 16, mcp: 13, length: 0.11, splay: -0.005 },
    { tip: 20, mcp: 17, length: 0.08, splay: -0.04 },
  ];
  for (const finger of fingers) {
    const mcp = points[finger.mcp];
    if (fist) {
      const wrist = points[0];
      points[finger.tip] = {
        x: mcp.x * 0.45 + wrist.x * 0.55,
        y: mcp.y * 0.45 + wrist.y * 0.55 - 0.01,
        z: -0.02,
      };
    } else {
      points[finger.tip] = {
        x: mcp.x + side * finger.splay,
        y: mcp.y - Math.sin(pitch) * finger.length,
        z: mcp.z - Math.cos(pitch) * finger.length,
      };
    }
  }

  // Apply the user's bank: their clockwise = counterclockwise in raw image
  // space, i.e. rotate by -roll around the hand center.
  const angle = -roll;
  for (let i = 0; i < points.length; i += 1) {
    const dx = points[i].x - center.x;
    const dy = points[i].y - center.y;
    points[i] = {
      x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
      y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle),
      z: points[i].z,
    };
  }

  return points;
}

describe("computeHandInputFromLandmarks", () => {
  test("accepts the instructed pose: level hand, fingers pointing at the camera", () => {
    for (const hand of ["right", "left"] as const) {
      const input = computeHandInputFromLandmarks(makeHand(hand), 1000);

      expect(input.tracked).toBe(true);
      expect(input.openHand).toBe(true);
      expect(input.confidence).toBeGreaterThan(0.6);
      expect(input.roll).toBeCloseTo(0, 1);
      expect(input.pitch).toBeCloseTo(0, 1);
    }
  });

  test("level right hand does not saturate roll (thumb at higher image x)", () => {
    const points = makeHand("right");
    expect(points[4].x).toBeGreaterThan(points[20].x);

    const input = computeHandInputFromLandmarks(points, 1000);
    expect(Math.abs(input.roll)).toBeLessThan(0.05);
  });

  test("banking right yields positive roll for both hands", () => {
    const right = computeHandInputFromLandmarks(makeHand("right", { roll: 0.52 }), 1000);
    const left = computeHandInputFromLandmarks(makeHand("left", { roll: 0.52 }), 1000);

    expect(right.openHand).toBe(true);
    expect(left.openHand).toBe(true);
    expect(right.roll).toBeGreaterThan(0.3);
    expect(left.roll).toBeGreaterThan(0.3);
    expect(right.roll).toBeCloseTo(left.roll, 1);
  });

  test("banking left yields negative roll", () => {
    const input = computeHandInputFromLandmarks(makeHand("right", { roll: -0.52 }), 1000);
    expect(input.roll).toBeLessThan(-0.3);
  });

  test("roll grows monotonically with bank angle", () => {
    const gentle = computeHandInputFromLandmarks(makeHand("right", { roll: 0.2 }), 1000);
    const steep = computeHandInputFromLandmarks(makeHand("right", { roll: 0.8 }), 1000);

    expect(gentle.roll).toBeGreaterThan(0.05);
    expect(steep.roll).toBeGreaterThan(gentle.roll);
    expect(steep.roll).toBeLessThanOrEqual(1);
  });

  test("rotating fingers up commands a climb, down commands a dive", () => {
    const up = computeHandInputFromLandmarks(makeHand("right", { pitch: 0.45 }), 1000);
    const down = computeHandInputFromLandmarks(makeHand("right", { pitch: -0.45 }), 1000);

    expect(up.openHand).toBe(true);
    expect(up.pitch).toBeGreaterThan(0.3);
    expect(down.pitch).toBeLessThan(-0.3);
  });

  test("pitch still reads correctly while the hand is banked", () => {
    const input = computeHandInputFromLandmarks(makeHand("right", { roll: 0.5, pitch: 0.4 }), 1000);

    expect(input.openHand).toBe(true);
    expect(input.roll).toBeGreaterThan(0.25);
    expect(input.pitch).toBeGreaterThan(0.2);
  });

  test("a fist keeps tracking but releases the controls", () => {
    const input = computeHandInputFromLandmarks(makeHand("right", { fist: true, roll: 0.5 }), 1000);

    expect(input.tracked).toBe(true);
    expect(input.openHand).toBe(false);
    expect(input.roll).toBe(0);
    expect(input.pitch).toBe(0);
  });

  test("reports thumb-index gap normalized by hand width", () => {
    const open = makeHand("right");
    const pinched = makeHand("right");
    pinched[4] = { ...pinched[8] };

    const openInput = computeHandInputFromLandmarks(open, 1000);
    const pinchedInput = computeHandInputFromLandmarks(pinched, 1040);

    expect(openInput.thumbIndexDistance).toBeGreaterThan(0.6);
    expect(pinchedInput.thumbIndexDistance).toBeLessThan(0.05);
  });

  test("tilted poses are shaped against fixed zero neutral angles", () => {
    const tilted = makeHand("right", { roll: 0.2, pitch: 0.2 });
    const input = computeHandInputFromLandmarks(tilted, 1000);

    expect(input.roll).toBeGreaterThan(0.05);
    expect(input.pitch).toBeGreaterThan(0.05);
  });

  test("returns empty input when landmarks are missing", () => {
    const input = computeHandInputFromLandmarks([], 1000);
    expect(input.tracked).toBe(false);
    expect(input.openHand).toBe(false);
  });
});

describe("continuousLineAngle", () => {
  test("passes the reading through when there is no history", () => {
    expect(continuousLineAngle(null, 0.4)).toBeCloseTo(0.4, 5);
  });

  test("keeps the banking direction past vertical instead of flipping", () => {
    // Hand at ~80deg right; the next frame is physically ~97deg, which the
    // undirected line angle wraps to -83deg. Continuity must pick +97deg.
    const unwrapped = continuousLineAngle(1.4, -1.45);
    expect(unwrapped).toBeCloseTo(-1.45 + Math.PI, 5);
    expect(unwrapped).toBeGreaterThan(1.4);
  });

  test("caps the unwrapped angle so it cannot wind up forever", () => {
    const capped = continuousLineAngle(2.2, -0.8); // continuation would be 2.34
    expect(capped).toBeLessThanOrEqual(Math.PI * 0.72);
    expect(capped).toBeGreaterThan(2.2);
  });

  test("re-syncs as the hand comes back below vertical", () => {
    expect(continuousLineAngle(1.69, 1.3)).toBeCloseTo(1.3, 5);
  });
});

describe("shapeAxis", () => {
  test("small angles inside the deadzone map to zero", () => {
    expect(shapeAxis(ROLL_FULL_SCALE * 0.04, ROLL_FULL_SCALE)).toBe(0);
    expect(shapeAxis(-PITCH_FULL_SCALE * 0.04, PITCH_FULL_SCALE)).toBe(0);
  });

  test("full-scale angles reach full deflection with matching sign", () => {
    expect(shapeAxis(ROLL_FULL_SCALE, ROLL_FULL_SCALE)).toBeCloseTo(1, 5);
    expect(shapeAxis(-ROLL_FULL_SCALE * 2, ROLL_FULL_SCALE)).toBeCloseTo(-1, 5);
  });

  test("response is monotonic", () => {
    let previous = 0;
    for (let step = 1; step <= 10; step += 1) {
      const value = shapeAxis((ROLL_FULL_SCALE * step) / 10, ROLL_FULL_SCALE);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});
