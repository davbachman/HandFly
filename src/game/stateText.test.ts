import { describe, expect, test } from "vitest";
import { createGameState, createObstacleCourseState, createPracticeModeState, createShootingGalleryState, renderGameStateToText } from "./stateText";

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
      fire: true,
      rollAngle: 0.24,
      pitchAngle: -0.19,
      openScore: 0.9,
      thumbIndexDistance: 0.4,
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
    expect(payload.controls).not.toHaveProperty("boost");
    expect(payload.obstacles.length).toBeGreaterThan(0);
    expect(Array.isArray(payload.balloons)).toBe(true);
    expect(payload.projectiles).toBe(0);
    expect(JSON.stringify(payload).length).toBeLessThan(2000);
  });

  test("practice mode serializes as an obstacle-free debug state", () => {
    const state = createPracticeModeState();

    const payload = JSON.parse(renderGameStateToText(state));

    expect(payload.mode).toBe("practice");
    expect(payload.debugVisible).toBe(true);
    expect(payload.obstacles).toEqual([]);
    expect(payload.balloons).toEqual([]);
  });

  test("obstacle course serializes with sparse repair balloons enabled", () => {
    const state = createObstacleCourseState();

    const payload = JSON.parse(renderGameStateToText(state));

    expect(payload.mode).toBe("flying");
    expect(payload.options.targetsEnabled).toBe(true);
    expect(payload.options.balloonMode).toBe("obstacle-course");
    expect(payload.obstacles.length).toBeGreaterThan(0);
    expect(payload.balloons.length).toBeGreaterThan(0);
  });

  test("shooting gallery serializes as balloon-only target mode", () => {
    const state = createShootingGalleryState();

    const payload = JSON.parse(renderGameStateToText(state));

    expect(payload.mode).toBe("shooting-gallery");
    expect(payload.options.targetsEnabled).toBe(true);
    expect(payload.obstacles).toEqual([]);
    expect(payload.balloons.length).toBeGreaterThan(0);
  });

  test("targets-enabled legacy states default to gallery scoring balloons", () => {
    const state = createGameState(11, { targetsEnabled: true });

    expect(state.options.balloonMode).toBe("gallery");
    expect(state.course.balloons.length).toBeGreaterThan(0);
    expect(state.course.balloons.every((balloon) => balloon.kind === "score")).toBe(true);
  });
});
