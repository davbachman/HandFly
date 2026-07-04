import { describe, expect, test } from "vitest";
import { CRUISE_SPEED, createInitialPlaneState, deriveFlightCommand, updatePlane } from "./flight";
import type { HandInputState, KeyboardInputState } from "../types";

function hand(overrides: Partial<HandInputState>): HandInputState {
  return {
    tracked: false,
    openHand: false,
    confidence: 0,
    roll: 0,
    pitch: 0,
    rollAngle: 0,
    pitchAngle: 0,
    openScore: 0,
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
  test("open hand steers while keyboard is idle", () => {
    const command = deriveFlightCommand(
      hand({ tracked: true, openHand: true, confidence: 0.95, roll: 0.8, pitch: -0.4, source: "mediapipe" }),
      neutralKeyboard,
    );

    expect(command.source).toBe("hand");
    expect(command.roll).toBeCloseTo(0.8);
    expect(command.pitch).toBeCloseTo(-0.4);
  });

  test("held keys deliberately override a tracked hand", () => {
    const command = deriveFlightCommand(
      hand({ tracked: true, openHand: true, confidence: 0.95, roll: 0.8, pitch: -0.4, source: "mediapipe" }),
      { ...neutralKeyboard, rollAxis: -1, pitchAxis: 1 },
    );

    expect(command.source).toBe("keyboard");
    expect(command.roll).toBeCloseTo(-1);
    expect(command.pitch).toBeCloseTo(1);
  });

  test("space and shift merge into hand flight instead of stealing the stick", () => {
    const command = deriveFlightCommand(
      hand({ tracked: true, openHand: true, confidence: 0.9, roll: 0.4, pitch: 0.1, source: "mediapipe" }),
      { ...neutralKeyboard, fire: true, boost: true },
    );

    expect(command.source).toBe("hand");
    expect(command.roll).toBeCloseTo(0.4);
    expect(command.fire).toBe(true);
    expect(command.boost).toBe(true);
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

  test("banking right moves the plane screen-right (-x) and climbs on positive pitch", () => {
    const plane = createInitialPlaneState();

    for (let i = 0; i < 60; i += 1) {
      updatePlane(plane, { roll: 1, pitch: 0.5, fire: false, boost: false, source: "hand", confidence: 1 }, 1 / 60);
    }

    expect(plane.roll).toBeGreaterThan(0.5);
    expect(plane.velocity.x).toBeLessThan(0);
    expect(plane.position.x).toBeLessThan(0);
    expect(plane.position.y).toBeGreaterThan(12);
    expect(plane.position.z).toBeLessThan(0);
  });

  test("yaw stays a bounded coordinated-turn lean instead of accumulating", () => {
    const plane = createInitialPlaneState();

    for (let i = 0; i < 600; i += 1) {
      updatePlane(plane, { roll: 1, pitch: 0, fire: false, boost: false, source: "hand", confidence: 1 }, 1 / 60);
    }
    expect(Math.abs(plane.yaw)).toBeLessThan(0.6);

    for (let i = 0; i < 600; i += 1) {
      updatePlane(plane, { roll: 0, pitch: 0, fire: false, boost: false, source: "none", confidence: 0 }, 1 / 60);
    }
    expect(Math.abs(plane.yaw)).toBeLessThan(0.02);
  });

  test("boost raises speed toward the boost multiplier and it decays back", () => {
    const plane = createInitialPlaneState();

    for (let i = 0; i < 180; i += 1) {
      updatePlane(plane, { roll: 0, pitch: 0, fire: false, boost: true, source: "keyboard", confidence: 1 }, 1 / 60);
    }
    expect(plane.speed).toBeGreaterThan(CRUISE_SPEED * 1.3);

    for (let i = 0; i < 240; i += 1) {
      updatePlane(plane, { roll: 0, pitch: 0, fire: false, boost: false, source: "none", confidence: 0 }, 1 / 60);
    }
    expect(plane.speed).toBeLessThan(CRUISE_SPEED * 1.05);
  });

  test("returns toward neutral when tracking is lost", () => {
    const plane = createInitialPlaneState();
    plane.roll = 0.9;
    plane.pitch = -0.6;

    updatePlane(plane, { roll: 0, pitch: 0, fire: false, boost: false, source: "none", confidence: 0 }, 0.4);

    expect(Math.abs(plane.roll)).toBeLessThan(0.9);
    expect(Math.abs(plane.pitch)).toBeLessThan(0.6);
  });
});
