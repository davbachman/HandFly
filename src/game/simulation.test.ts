import { describe, expect, test } from "vitest";
import { createGameState, createPracticeModeState, createShootingGalleryState } from "./stateText";
import { HIT_DAMAGE, INVULNERABLE_MS, stepGame } from "./simulation";
import { MIN_ALTITUDE } from "./flight";

describe("stepGame", () => {
  test("moves the plane and scores passed obstacles while flying", () => {
    const state = createGameState(5);
    state.mode = "flying";
    state.keyboard.rollAxis = 0.5;
    state.keyboard.pitchAxis = 0.25;
    state.plane.position.z = -450;

    stepGame(state, 0.25);

    expect(state.mode).toBe("flying");
    expect(state.plane.position.z).toBeLessThan(-450);
    expect(state.course.score).toBeGreaterThan(0);
    expect(state.command.source).toBe("keyboard");
  });

  test("collisions damage the hull, with a grace window between hits", () => {
    const state = createGameState(5);
    state.mode = "flying";
    // A mountain wall the plane stays inside of for many steps.
    state.course.obstacles = [
      {
        id: "test-mountain",
        type: "mountain",
        position: { x: 0, y: 3, z: -900 },
        width: 400,
        height: 100,
        depth: 2000,
        passed: false,
      },
    ];

    stepGame(state, 1 / 60);

    expect(state.mode).toBe("flying");
    expect(state.plane.health).toBeCloseTo(1 - HIT_DAMAGE, 5);
    expect(state.lastHitMs).toBeGreaterThanOrEqual(0);

    // Still inside the obstacle immediately after: protected by the window.
    stepGame(state, 1 / 60);
    expect(state.plane.health).toBeCloseTo(1 - HIT_DAMAGE, 5);
  });

  test("the third hit downs the plane", () => {
    const state = createGameState(5);
    state.mode = "flying";
    state.course.obstacles = [
      {
        id: "test-mountain",
        type: "mountain",
        position: { x: 0, y: 3, z: -900 },
        width: 400,
        height: 100,
        depth: 2000,
        passed: false,
      },
    ];

    for (let i = 0; i < 400 && state.mode === "flying"; i += 1) {
      stepGame(state, 0.05);
    }

    expect(state.mode).toBe("crashed");
    expect(state.plane.health).toBe(0);
    expect(state.crashReason).toContain("mountain");
    // Two full invulnerability windows must have elapsed before the fatal hit.
    expect(state.elapsedMs).toBeGreaterThanOrEqual(INVULNERABLE_MS * 2);
  });

  test("scraping the ground damages the hull and bounces the plane up", () => {
    const state = createGameState(5);
    state.mode = "flying";
    state.course.obstacles = [];
    state.keyboard.pitchAxis = -1;

    let firstHitY: number | null = null;
    for (let i = 0; i < 600 && state.mode === "flying"; i += 1) {
      stepGame(state, 0.05);
      if (firstHitY === null && state.plane.health < 1) {
        firstHitY = state.plane.position.y;
      }
    }

    expect(firstHitY).not.toBeNull();
    expect(firstHitY as number).toBeGreaterThan(2.61); // bounced off the deck
    expect(state.mode).toBe("crashed");
    expect(state.crashReason).toContain("ground");
    expect(state.plane.health).toBe(0);
  });

  test("practice mode flies without obstacles, scoring, or collision damage", () => {
    const state = createPracticeModeState();
    state.keyboard.rollAxis = 0.6;
    state.keyboard.pitchAxis = 0.4;

    stepGame(state, 0.5);

    expect(state.mode).toBe("practice");
    expect(state.command.source).toBe("keyboard");
    expect(state.plane.position.z).toBeLessThan(0);
    expect(state.plane.position.y).toBeGreaterThan(12);
    expect(state.course.obstacles).toEqual([]);
    expect(state.course.score).toBe(0);
    expect(state.plane.health).toBe(1);
  });

  test("shooting gallery flies with balloons only and ramming a balloon damages the hull", () => {
    const state = createShootingGalleryState();
    const balloon = state.course.balloons[0];
    balloon.position = { ...state.plane.position };

    stepGame(state, 1 / 60);

    expect(state.mode).toBe("shooting-gallery");
    expect(state.course.obstacles).toEqual([]);
    expect(state.course.balloons.length).toBeGreaterThan(0);
    expect(balloon.popped).toBe(true);
    expect(state.course.score).toBe(0);
    expect(state.plane.health).toBeCloseTo(1 - HIT_DAMAGE, 5);
    expect(state.events.some((event) => event.type === "hit")).toBe(true);
  });

  test("shooting gallery ground hits damage the hull", () => {
    const state = createShootingGalleryState();
    state.plane.position.y = MIN_ALTITUDE;

    stepGame(state, 1 / 60);

    expect(state.mode).toBe("shooting-gallery");
    expect(state.plane.health).toBeCloseTo(1 - HIT_DAMAGE, 5);
    expect(state.events.some((event) => event.type === "hit")).toBe(true);
  });
});
