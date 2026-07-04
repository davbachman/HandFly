import { describe, expect, test } from "vitest";
import { createCourse, getVisibleObstacles, updateCourse } from "./course";
import { createInitialPlaneState } from "./flight";
import { checkCourseCollision, updateObstaclePasses } from "./collision";

describe("endless course", () => {
  test("starts with varied obstacle types ahead of the plane", () => {
    const course = createCourse(7);
    const visible = getVisibleObstacles(course, 0);

    expect(visible.length).toBeGreaterThanOrEqual(8);
    expect(new Set(visible.map((obstacle) => obstacle.type))).toEqual(
      new Set(["gate", "tunnel", "bridge", "mountain"]),
    );
    expect(visible.every((obstacle) => obstacle.position.z < 0)).toBe(true);
  });

  test("recycles obstacles and increases score after passing them", () => {
    const course = createCourse(7);
    const plane = createInitialPlaneState();
    plane.position.z = -180;

    const passed = updateObstaclePasses(course, plane);
    updateCourse(course, plane.position.z);

    expect(passed).toBeGreaterThan(0);
    expect(course.score).toBeGreaterThan(0);
    expect(course.obstacles.length).toBeGreaterThanOrEqual(12);
    expect(Math.min(...course.obstacles.map((obstacle) => obstacle.position.z))).toBeLessThan(-400);
  });

  test("threading an opening scores more than skirting around it", () => {
    const gate = {
      id: "gate-score",
      type: "gate" as const,
      position: { x: 0, y: 12, z: -4 },
      width: 24,
      height: 18,
      depth: 4,
      passed: false,
    };
    const threadedCourse = createCourse(1);
    threadedCourse.obstacles = [{ ...gate }];
    const threadedPlane = createInitialPlaneState();
    threadedPlane.position.z = -10;
    updateObstaclePasses(threadedCourse, threadedPlane);
    expect(threadedCourse.score).toBe(100);

    const bypassCourse = createCourse(1);
    bypassCourse.obstacles = [{ ...gate }];
    const bypassPlane = createInitialPlaneState();
    bypassPlane.position.z = -10;
    bypassPlane.position.x = 40;
    updateObstaclePasses(bypassCourse, bypassPlane);
    expect(bypassCourse.score).toBe(25);
  });

  test("suspension bridge blocks on the deck and towers but not the spans", () => {
    const plane = createInitialPlaneState();
    const course = createCourse(2);
    course.obstacles = [
      {
        id: "bridge-solid",
        type: "bridge",
        position: { x: 0, y: 20, z: -2 },
        width: 46,
        height: 6,
        depth: 16,
        passed: false,
      },
    ];
    // Towers sit at x = +-(width/2 - 4) = +-19 and rise 14 above the deck.

    plane.position.x = 0;
    plane.position.y = 27; // over the deck, centered between the towers
    expect(checkCourseCollision(course, plane)).toBeNull();

    plane.position.y = 20; // into the deck slab
    expect(checkCourseCollision(course, plane)?.id).toBe("bridge-solid");

    plane.position.x = 10;
    plane.position.y = 8; // under the deck, between pier and center
    expect(checkCourseCollision(course, plane)).toBeNull();

    plane.position.x = 19;
    expect(checkCourseCollision(course, plane)?.id).toBe("bridge-solid"); // pier column

    plane.position.y = 30; // tower column above the deck
    expect(checkCourseCollision(course, plane)?.id).toBe("bridge-solid");

    plane.position.y = 42; // above the tower tops (20 + 3 + 14 = 37)
    expect(checkCourseCollision(course, plane)).toBeNull();
  });

  test("flying wide of a gate is safe but its frame is solid", () => {
    const plane = createInitialPlaneState();
    const course = createCourse(3);
    course.obstacles = [
      {
        id: "gate-frame",
        type: "gate",
        position: { x: 0, y: 12, z: -2 },
        width: 24,
        height: 18,
        depth: 4,
        passed: false,
      },
    ];

    plane.position.x = 40; // well clear of the structure
    expect(checkCourseCollision(course, plane)).toBeNull();

    plane.position.x = 12.5; // inside the frame band around the opening
    expect(checkCourseCollision(course, plane)?.id).toBe("gate-frame");
  });

  test("detects a mountain collision but allows a clean gate traversal", () => {
    const plane = createInitialPlaneState();
    const course = createCourse(3);
    course.obstacles = [
      {
        id: "gate-clean",
        type: "gate",
        position: { x: 0, y: 12, z: -4 },
        width: 24,
        height: 18,
        depth: 4,
        passed: false,
      },
      {
        id: "mountain-hit",
        type: "mountain",
        position: { x: 0, y: 5, z: -2 },
        width: 22,
        height: 18,
        depth: 18,
        passed: false,
      },
    ];

    expect(checkCourseCollision({ ...course, obstacles: [course.obstacles[0]] }, plane)).toBeNull();
    expect(checkCourseCollision({ ...course, obstacles: [course.obstacles[1]] }, plane)?.type).toBe("mountain");
  });
});

