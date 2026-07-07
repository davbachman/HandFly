import { describe, expect, test } from "vitest";
import { createGameState, createObstacleCourseState, createShootingGalleryState } from "./stateText";
import { BALLOON_SCORE, FIRE_COOLDOWN_MS, updateProjectilesAndBalloons } from "./projectiles";
import { HULL_SEGMENT } from "./flight";
import type { Balloon, GameState } from "../types";

function flyingState(): GameState {
  const state = createObstacleCourseState(9);
  state.command.fire = true;
  return state;
}

function galleryState(): GameState {
  const state = createShootingGalleryState(9);
  state.command.fire = true;
  return state;
}

function balloonAhead(state: GameState, overrides: Partial<Balloon> = {}): Balloon {
  const balloon = state.course.balloons[0];
  Object.assign(balloon, {
    kind: "score",
    position: { x: state.plane.position.x, y: state.plane.position.y, z: state.plane.position.z - 60 },
    popped: false,
    ...overrides,
  });
  return balloon;
}

describe("updateProjectilesAndBalloons", () => {
  test("ignores fire input when targets are disabled", () => {
    const state = createGameState(9);
    state.mode = "flying";
    state.command.fire = true;
    state.elapsedMs = 1000;

    updateProjectilesAndBalloons(state, 1 / 60);

    expect(state.projectiles).toHaveLength(0);
    expect(state.events).toEqual([]);
  });

  test("fire spawns projectiles with a cooldown", () => {
    const state = flyingState();
    state.elapsedMs = 1000;

    updateProjectilesAndBalloons(state, 1 / 60);
    expect(state.projectiles).toHaveLength(1);

    // Immediately again: still cooling down.
    state.elapsedMs += 16;
    updateProjectilesAndBalloons(state, 1 / 60);
    expect(state.projectiles).toHaveLength(1);

    state.elapsedMs += FIRE_COOLDOWN_MS;
    updateProjectilesAndBalloons(state, 1 / 60);
    expect(state.projectiles).toHaveLength(2);
    expect(state.events.filter((event) => event.type === "shot")).toHaveLength(2);
  });

  test("projectiles fly forward and expire", () => {
    const state = flyingState();
    state.elapsedMs = 1000;
    updateProjectilesAndBalloons(state, 1 / 60);
    const spawnedZ = state.projectiles[0].position.z;

    state.command.fire = false;
    state.elapsedMs += 100;
    updateProjectilesAndBalloons(state, 0.1);
    expect(state.projectiles[0].position.z).toBeLessThan(spawnedZ);

    state.elapsedMs += 2000;
    updateProjectilesAndBalloons(state, 1 / 60);
    expect(state.projectiles).toHaveLength(0);
  });

  test("a shot pops a shooting-gallery score balloon for points", () => {
    const state = galleryState();
    state.elapsedMs = 1000;
    const balloon = balloonAhead(state);

    for (let i = 0; i < 30 && !balloon.popped; i += 1) {
      state.elapsedMs += 1000 / 60;
      updateProjectilesAndBalloons(state, 1 / 60);
    }

    expect(balloon.popped).toBe(true);
    expect(state.course.score).toBe(BALLOON_SCORE);
    expect(state.events.some((event) => event.type === "balloon-pop")).toBe(true);
  });

  test("gallery-mode balloons score even if the state is running as a flight", () => {
    const state = createGameState(9, { targetsEnabled: true });
    state.mode = "flying";
    state.command.fire = true;
    state.elapsedMs = 1000;
    const balloon = balloonAhead(state);

    for (let i = 0; i < 30 && !balloon.popped; i += 1) {
      state.elapsedMs += 1000 / 60;
      updateProjectilesAndBalloons(state, 1 / 60);
    }

    expect(state.options.balloonMode).toBe("gallery");
    expect(balloon.popped).toBe(true);
    expect(state.course.score).toBe(BALLOON_SCORE);
    expect(state.plane.health).toBe(1);
  });

  test("popping an obstacle-course balloon restores hull without scoring", () => {
    const state = flyingState();
    state.elapsedMs = 1000;
    state.plane.health = 0.32;
    const balloon = balloonAhead(state, { kind: "score" });

    for (let i = 0; i < 30 && !balloon.popped; i += 1) {
      state.elapsedMs += 1000 / 60;
      updateProjectilesAndBalloons(state, 1 / 60);
    }

    expect(balloon.popped).toBe(true);
    expect(state.plane.health).toBeCloseTo(0.32 + HULL_SEGMENT, 5);
    expect(state.course.score).toBe(0);
    expect(state.events.some((event) => event.type === "repair")).toBe(true);
  });

  test("flying into an unshot obstacle-course balloon damages the hull", () => {
    const state = flyingState();
    state.command.fire = false;
    const balloon = balloonAhead(state, {
      position: { ...state.plane.position },
    });

    updateProjectilesAndBalloons(state, 1 / 60);

    expect(balloon.popped).toBe(true);
    expect(state.course.score).toBe(0);
    expect(state.plane.health).toBeCloseTo(1 - HULL_SEGMENT, 5);
    expect(state.events.some((event) => event.type === "hit")).toBe(true);
  });

  test("flying into a balloon in shooting gallery damages instead of scoring", () => {
    const state = galleryState();
    state.command.fire = false;
    const balloon = balloonAhead(state, {
      position: { ...state.plane.position },
    });

    updateProjectilesAndBalloons(state, 1 / 60);

    expect(balloon.popped).toBe(true);
    expect(state.course.score).toBe(0);
    expect(state.plane.health).toBeCloseTo(1 - HULL_SEGMENT, 5);
    expect(state.events.some((event) => event.type === "hit")).toBe(true);
  });
});
