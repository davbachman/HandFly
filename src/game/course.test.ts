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
    expect(course.score).toBe(passed * 100);
    expect(course.obstacles.length).toBeGreaterThanOrEqual(12);
    expect(Math.min(...course.obstacles.map((obstacle) => obstacle.position.z))).toBeLessThan(-400);
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

