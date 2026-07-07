import type { CourseState, Obstacle, PlaneState } from "../types";

// How far the solid frame/wall extends beyond the opening of a gate or
// tunnel. Outside that band the plane is flying around the obstacle, which
// is safe (but scores less).
const FRAME_RIM = 1.4;

// Suspension-bridge tower geometry, shared with the renderer so the visual
// towers and the solid columns stay in lockstep.
export const BRIDGE_TOWER_INSET = 4;
export const BRIDGE_TOWER_HALF_WIDTH = 1.6;
export const BRIDGE_TOWER_RISE = 14;

function zOverlaps(obstacle: Obstacle, plane: PlaneState): boolean {
  return Math.abs(obstacle.position.z - plane.position.z) <= obstacle.depth / 2 + plane.radius;
}

export function insideOpening(obstacle: Obstacle, plane: PlaneState): boolean {
  const halfWidth = obstacle.width / 2 - plane.radius;
  const halfHeight = obstacle.height / 2 - plane.radius;
  return Math.abs(plane.position.x - obstacle.position.x) <= halfWidth && Math.abs(plane.position.y - obstacle.position.y) <= halfHeight;
}

// Hitting the rim/frame around the opening crashes; flying wide of the
// whole structure does not.
function hitsFrame(obstacle: Obstacle, plane: PlaneState): boolean {
  const outerHalfWidth = obstacle.width / 2 + FRAME_RIM + plane.radius;
  const outerHalfHeight = obstacle.height / 2 + FRAME_RIM + plane.radius;
  const withinOuter =
    Math.abs(plane.position.x - obstacle.position.x) <= outerHalfWidth &&
    Math.abs(plane.position.y - obstacle.position.y) <= outerHalfHeight;
  return withinOuter && !insideOpening(obstacle, plane);
}

function hitsMountain(obstacle: Obstacle, plane: PlaneState): boolean {
  const dx = Math.abs(plane.position.x - obstacle.position.x);
  const horizontalLimit = obstacle.width / 2 + plane.radius;
  const heightAtPlane = obstacle.position.y + obstacle.height * Math.max(0, 1 - dx / horizontalLimit);
  return dx <= horizontalLimit && plane.position.y - plane.radius <= heightAtPlane;
}

// The deck is a horizontal slab; the two suspension towers are solid
// columns from the ground to their tops. Fly over or under the deck,
// between the towers.
function hitsBridge(obstacle: Obstacle, plane: PlaneState): boolean {
  const deckXHit = Math.abs(plane.position.x - obstacle.position.x) <= obstacle.width / 2 + plane.radius;
  const deckYHit = Math.abs(plane.position.y - obstacle.position.y) <= obstacle.height / 2 + plane.radius;
  if (deckXHit && deckYHit) return true;

  const towerX = obstacle.width / 2 - BRIDGE_TOWER_INSET;
  const towerTop = obstacle.position.y + obstacle.height / 2 + BRIDGE_TOWER_RISE;
  if (plane.position.y - plane.radius > towerTop) return false;
  const towerReach = BRIDGE_TOWER_HALF_WIDTH + plane.radius;
  return (
    Math.abs(plane.position.x - (obstacle.position.x - towerX)) <= towerReach ||
    Math.abs(plane.position.x - (obstacle.position.x + towerX)) <= towerReach
  );
}

export function checkObstacleCollision(obstacle: Obstacle, plane: PlaneState): boolean {
  if (!zOverlaps(obstacle, plane)) return false;

  if (obstacle.type === "gate" || obstacle.type === "tunnel") {
    return hitsFrame(obstacle, plane);
  }

  if (obstacle.type === "bridge") {
    return hitsBridge(obstacle, plane);
  }

  return hitsMountain(obstacle, plane);
}

export function checkCourseCollision(course: CourseState, plane: PlaneState): Obstacle | null {
  return course.obstacles.find((obstacle) => checkObstacleCollision(obstacle, plane)) ?? null;
}

export interface PassResult {
  passed: number;
  threaded: number;
  bypassed: number;
}

// Threading a gate or tunnel opening scores full points; skirting around an
// obstacle still counts the pass but pays less.
export function updateObstaclePasses(course: CourseState, plane: PlaneState): PassResult {
  const result: PassResult = { passed: 0, threaded: 0, bypassed: 0 };
  for (const obstacle of course.obstacles) {
    if (!obstacle.passed && obstacle.position.z > plane.position.z + obstacle.depth / 2) {
      obstacle.passed = true;
      result.passed += 1;
      if (obstacle.type === "gate" || obstacle.type === "tunnel") {
        if (insideOpening(obstacle, plane)) {
          course.score += 100;
          result.threaded += 1;
        } else {
          course.score += 25;
          result.bypassed += 1;
        }
      } else {
        course.score += 50;
        result.bypassed += 1;
      }
    }
  }
  return result;
}
