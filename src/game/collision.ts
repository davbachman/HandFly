import type { CourseState, Obstacle, PlaneState } from "../types";

function zOverlaps(obstacle: Obstacle, plane: PlaneState): boolean {
  return Math.abs(obstacle.position.z - plane.position.z) <= obstacle.depth / 2 + plane.radius;
}

function insideOpening(obstacle: Obstacle, plane: PlaneState): boolean {
  const halfWidth = obstacle.width / 2 - plane.radius;
  const halfHeight = obstacle.height / 2 - plane.radius;
  return Math.abs(plane.position.x - obstacle.position.x) <= halfWidth && Math.abs(plane.position.y - obstacle.position.y) <= halfHeight;
}

function hitsMountain(obstacle: Obstacle, plane: PlaneState): boolean {
  const dx = Math.abs(plane.position.x - obstacle.position.x);
  const horizontalLimit = obstacle.width / 2 + plane.radius;
  const heightAtPlane = obstacle.position.y + obstacle.height * Math.max(0, 1 - dx / horizontalLimit);
  return dx <= horizontalLimit && plane.position.y - plane.radius <= heightAtPlane;
}

function hitsBridge(obstacle: Obstacle, plane: PlaneState): boolean {
  const xHit = Math.abs(plane.position.x - obstacle.position.x) <= obstacle.width / 2 + plane.radius;
  const yHit = Math.abs(plane.position.y - obstacle.position.y) <= obstacle.height / 2 + plane.radius;
  return xHit && yHit;
}

export function checkObstacleCollision(obstacle: Obstacle, plane: PlaneState): boolean {
  if (!zOverlaps(obstacle, plane)) return false;

  if (obstacle.type === "gate" || obstacle.type === "tunnel") {
    return !insideOpening(obstacle, plane);
  }

  if (obstacle.type === "bridge") {
    return hitsBridge(obstacle, plane);
  }

  return hitsMountain(obstacle, plane);
}

export function checkCourseCollision(course: CourseState, plane: PlaneState): Obstacle | null {
  return course.obstacles.find((obstacle) => checkObstacleCollision(obstacle, plane)) ?? null;
}

export function updateObstaclePasses(course: CourseState, plane: PlaneState): number {
  let passed = 0;
  for (const obstacle of course.obstacles) {
    if (!obstacle.passed && obstacle.position.z > plane.position.z + obstacle.depth / 2) {
      obstacle.passed = true;
      passed += 1;
    }
  }
  course.score += passed * 100;
  return passed;
}

