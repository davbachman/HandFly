import { describe, expect, test } from "vitest";
import { createGameState, renderGameStateToText } from "./stateText";

describe("renderGameStateToText", () => {
  test("returns concise JSON with coordinates, plane, course, tracking, and controls", () => {
    const state = createGameState();
    state.mode = "flying";
    state.hand = {
      tracked: true,
      openHand: true,
      confidence: 0.91,
      roll: 0.25,
      pitch: -0.2,
      lastSeenMs: 33,
      source: "mediapipe",
    };
    state.command = {
      roll: 0.25,
      pitch: -0.2,
      fire: true,
      source: "hand",
      confidence: 0.91,
    };

    const payload = JSON.parse(renderGameStateToText(state));

    expect(payload.coordinateSystem).toContain("z decreases forward");
    expect(payload.mode).toBe("flying");
    expect(payload.plane).toMatchObject({ x: 0, y: 12, z: 0, speed: 72 });
    expect(payload.tracking).toMatchObject({ tracked: true, openHand: true, confidence: 0.91 });
    expect(payload.controls).toMatchObject({ roll: 0.25, pitch: -0.2, fire: true, source: "hand" });
    expect(payload.obstacles.length).toBeGreaterThan(0);
    expect(JSON.stringify(payload).length).toBeLessThan(1600);
  });
});

