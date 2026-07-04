import { describe, expect, test } from "vitest";
import { createGameState } from "./stateText";
import { stepGame } from "./simulation";

describe("stepGame", () => {
  test("moves the plane and scores passed obstacles while flying", () => {
    const state = createGameState(5);
    state.mode = "flying";
    state.keyboard.rollAxis = 0.5;
    state.keyboard.pitchAxis = 0.25;
    state.plane.position.z = -170;

    stepGame(state, 0.25);

    expect(state.mode).toBe("flying");
    expect(state.plane.position.z).toBeLessThan(-170);
    expect(state.course.score).toBeGreaterThan(0);
    expect(state.command.source).toBe("keyboard");
  });

  test("switches to crashed mode when the plane hits an obstacle", () => {
    const state = createGameState(5);
    state.mode = "flying";
    state.course.obstacles = [
      {
        id: "test-mountain",
        type: "mountain",
        position: { x: 0, y: 3, z: 0 },
        width: 35,
        height: 24,
        depth: 30,
        passed: false,
      },
    ];

    stepGame(state, 1 / 60);

    expect(state.mode).toBe("crashed");
    expect(state.plane.health).toBe(0);
    expect(state.crashReason).toContain("mountain");
  });
});

