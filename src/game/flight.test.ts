import { describe, expect, test } from "vitest";
import { createInitialPlaneState, deriveFlightCommand, updatePlane } from "./flight";
import type { HandInputState, KeyboardInputState } from "../types";

function hand(overrides: Partial<HandInputState>): HandInputState {
  return {
    tracked: false,
    openHand: false,
    confidence: 0,
    roll: 0,
    pitch: 0,
    lastSeenMs: 0,
    source: "none",
    ...overrides,
  };
}

const neutralKeyboard: KeyboardInputState = {
  rollAxis: 0,
  pitchAxis: 0,
  fire: false,
  boost: false,
};

describe("flight model", () => {
  test("uses confident open-hand input before keyboard fallback", () => {
    const command = deriveFlightCommand(
      hand({ tracked: true, openHand: true, confidence: 0.95, roll: 0.8, pitch: -0.4, source: "mediapipe" }),
      { ...neutralKeyboard, rollAxis: -1, pitchAxis: 1 },
    );

    expect(command.source).toBe("hand");
    expect(command.roll).toBeCloseTo(0.8);
    expect(command.pitch).toBeCloseTo(-0.4);
  });

  test("uses open-hand roll even when tracking confidence dips", () => {
    const command = deriveFlightCommand(
      hand({ tracked: true, openHand: true, confidence: 0.32, roll: -0.75, pitch: 0.1, source: "mediapipe" }),
      neutralKeyboard,
    );

    expect(command.source).toBe("hand");
    expect(command.roll).toBeCloseTo(-0.75);
    expect(command.pitch).toBeCloseTo(0.1);
    expect(command.confidence).toBeCloseTo(0.32);
  });

  test("falls back to keyboard when hand is not open", () => {
    const command = deriveFlightCommand(
      hand({ tracked: true, openHand: false, confidence: 0.2, roll: 0.8, pitch: -0.4, source: "mediapipe" }),
      { ...neutralKeyboard, rollAxis: -0.5, pitchAxis: 0.25, fire: true },
    );

    expect(command.source).toBe("keyboard");
    expect(command.roll).toBeCloseTo(-0.5);
    expect(command.pitch).toBeCloseTo(0.25);
    expect(command.fire).toBe(true);
  });

  test("eases plane attitude and position toward arcade-sim command", () => {
    const plane = createInitialPlaneState();

    updatePlane(plane, { roll: 1, pitch: 0.5, fire: false, source: "hand", confidence: 1 }, 0.5);

    expect(plane.roll).toBeGreaterThan(0.1);
    expect(plane.pitch).toBeGreaterThan(0.05);
    expect(plane.position.x).toBeGreaterThan(0);
    expect(plane.position.y).toBeGreaterThan(12);
    expect(plane.position.z).toBeLessThan(0);
    expect(plane.speed).toBe(72);
  });

  test("returns toward neutral when tracking is lost", () => {
    const plane = createInitialPlaneState();
    plane.roll = 0.9;
    plane.pitch = -0.6;

    updatePlane(plane, { roll: 0, pitch: 0, fire: false, source: "none", confidence: 0 }, 0.4);

    expect(Math.abs(plane.roll)).toBeLessThan(0.9);
    expect(Math.abs(plane.pitch)).toBeLessThan(0.6);
  });
});
