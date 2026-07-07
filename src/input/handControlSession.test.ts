import { describe, expect, test } from "vitest";
import { createHandControlSession } from "./handControlSession";
import type { HandInputState } from "../types";

function rawHand(overrides: Partial<HandInputState> = {}): HandInputState {
  return {
    tracked: true,
    openHand: true,
    confidence: 0.95,
    roll: 0,
    pitch: 0,
    fire: false,
    rollAngle: 0,
    pitchAngle: 0,
    openScore: 0.95,
    thumbIndexDistance: 0.9,
    lastSeenMs: 0,
    source: "mediapipe",
    ...overrides,
  };
}

function noHand(nowMs: number): HandInputState {
  return rawHand({
    tracked: false,
    openHand: false,
    confidence: 0,
    fire: false,
    rollAngle: 0,
    pitchAngle: 0,
    openScore: 0,
    thumbIndexDistance: 0,
    lastSeenMs: nowMs,
    source: "none",
  });
}

describe("createHandControlSession", () => {
  test("uses fixed neutral angles and steers immediately from an open hand", () => {
    const session = createHandControlSession();

    session.update(rawHand({ rollAngle: 0.65, pitchAngle: -0.45, lastSeenMs: 1000 }), 1000);

    expect(session.status).toBe("Hand control active");
    expect(session.state.openHand).toBe(true);
    expect(session.state.roll).toBeGreaterThan(0.35);
    expect(session.state.pitch).toBeLessThan(-0.2);
  });

  test("does not store the first seen pose as neutral", () => {
    const session = createHandControlSession();

    for (let nowMs = 0; nowMs <= 3200; nowMs += 100) {
      session.update(rawHand({ rollAngle: 0.75, pitchAngle: 0.5, lastSeenMs: nowMs }), nowMs);
    }

    expect(session.state.roll).toBeGreaterThan(0.6);
    expect(session.state.pitch).toBeGreaterThan(0.45);
  });

  test("reacquires directional control immediately after a long tracking loss", () => {
    const session = createHandControlSession();

    for (let nowMs = 0; nowMs <= 80; nowMs += 40) {
      session.update(rawHand({ rollAngle: 0.85, lastSeenMs: nowMs }), nowMs);
    }
    expect(session.state.roll).toBeGreaterThan(0.55);

    session.update(noHand(1300), 1300);
    session.update(noHand(1700), 1700);
    expect(session.state.openHand).toBe(false);

    session.update(rawHand({ rollAngle: -0.85, lastSeenMs: 1800 }), 1800);

    expect(session.state.openHand).toBe(true);
    expect(session.state.roll).toBeLessThan(-0.7);
  });

  test("keeps roll continuity through a brief tracking dropout", () => {
    const session = createHandControlSession();

    session.update(rawHand({ rollAngle: 1.4, lastSeenMs: 0 }), 0);
    session.update(noHand(120), 120);
    session.update(rawHand({ rollAngle: -1.45, lastSeenMs: 180 }), 180);

    expect(session.state.openHand).toBe(true);
    expect(session.state.roll).toBeGreaterThan(0.9);
  });

  test("keeps steering when open-hand confidence is marginal after control starts", () => {
    const session = createHandControlSession();

    session.update(rawHand({ lastSeenMs: 1000 }), 1000);
    for (let nowMs = 1100; nowMs <= 1500; nowMs += 100) {
      session.update(
        rawHand({
          openHand: false,
          openScore: 0.42,
          confidence: 0.22,
          rollAngle: 0.65,
          lastSeenMs: nowMs,
        }),
        nowMs,
      );
    }

    expect(session.state.openHand).toBe(true);
    expect(session.state.roll).toBeGreaterThan(0.35);
  });

  test("releases control when the hand is clearly closed", () => {
    const session = createHandControlSession();

    session.update(rawHand({ rollAngle: 0.65, lastSeenMs: 1000 }), 1000);

    for (let nowMs = 1100; nowMs <= 1500; nowMs += 100) {
      session.update(
        rawHand({
          openHand: false,
          openScore: 0.08,
          confidence: 0.04,
          rollAngle: 0.65,
          lastSeenMs: nowMs,
        }),
        nowMs,
      );
    }

    expect(session.state.openHand).toBe(false);
  });

  test("does not fire when the thumb quickly moves toward the index finger", () => {
    const session = createHandControlSession();

    session.update(rawHand({ thumbIndexDistance: 0.9, lastSeenMs: 1000 }), 1000);
    expect(session.state.fire).toBe(false);

    session.update(rawHand({ thumbIndexDistance: 0.35, lastSeenMs: 1080 }), 1080);
    expect(session.state.fire).toBe(false);

    session.update(rawHand({ thumbIndexDistance: 0.3, lastSeenMs: 1120 }), 1120);
    expect(session.state.fire).toBe(false);
  });

  test("does not fire when the thumb closes slowly", () => {
    const session = createHandControlSession();

    session.update(rawHand({ thumbIndexDistance: 0.9, lastSeenMs: 1000 }), 1000);
    session.update(rawHand({ thumbIndexDistance: 0.65, lastSeenMs: 1080 }), 1080);
    session.update(rawHand({ thumbIndexDistance: 0.4, lastSeenMs: 1160 }), 1160);

    expect(session.state.fire).toBe(false);
  });
});
