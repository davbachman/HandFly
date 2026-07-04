import { clamp } from "../math";
import type { CourseState, Obstacle, ObstacleType } from "../types";

const TYPES: ObstacleType[] = ["gate", "tunnel", "bridge", "mountain"];
const SPACING = 68;
const VISIBLE_BACK = 90;
const VISIBLE_FRONT = 700;
// Distance (in -z) over which the course reaches full difficulty.
const DIFFICULTY_RAMP = 2600;

function seeded(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

// How far the opening of the next gate/tunnel may sit from the previous
// one. The plane covers ~30 lateral units between obstacles at full bank,
// and hand tracking is far less precise than a keyboard, so keep openings
// within a comfortable reach — anything beyond would be unflyable, not hard.
const MAX_X_JUMP = 20;
const MAX_Y_JUMP = 12;

interface PreviousOpening {
  x: number;
  y: number;
}

function makeObstacle(
  type: ObstacleType,
  id: number,
  z: number,
  random: () => number,
  difficulty = 0,
  previous: PreviousOpening = { x: 0, y: 12 },
): Obstacle {
  const side = random() > 0.5 ? 1 : -1;
  const stretch = 1 + difficulty * 0.55;
  const rawX = side * (5 + random() * 16) * stretch;
  const y = 10 + random() * (20 + difficulty * 8);
  const reachableX = (value: number): number => clamp(clamp(value, previous.x - MAX_X_JUMP, previous.x + MAX_X_JUMP), -40, 40);
  const reachableY = clamp(y, previous.y - MAX_Y_JUMP, previous.y + MAX_Y_JUMP);

  switch (type) {
    case "gate":
      return {
        id: `gate-${id}`,
        type,
        position: { x: reachableX(rawX), y: reachableY, z },
        width: 25 - difficulty * 6,
        height: 18 - difficulty * 3,
        depth: 8,
        passed: false,
      };
    case "tunnel":
      return {
        id: `tunnel-${id}`,
        type,
        position: { x: reachableX(rawX * 0.55), y: reachableY, z },
        width: 28 - difficulty * 6,
        height: 23 - difficulty * 4,
        depth: 36,
        passed: false,
      };
    case "bridge":
      return {
        id: `bridge-${id}`,
        type,
        position: { x: 0, y: 13 + random() * 18, z },
        width: 46,
        height: 6 + difficulty * 3,
        depth: 16,
        passed: false,
      };
    case "mountain": {
      // Keep the pass beside the peak within a quick dodge of the corridor
      // line the previous opening established.
      const width = 24 + random() * 15;
      let peakX = side * (8 + random() * 18);
      const minClear = width / 2 + 14;
      if (Math.abs(peakX - previous.x) < minClear) {
        peakX = previous.x + (peakX >= previous.x ? minClear : -minClear);
      }
      return {
        id: `mountain-${id}`,
        type,
        position: { x: clamp(peakX, -44, 44), y: 3, z },
        width,
        height: 18 + random() * 19 + difficulty * 8,
        depth: 24,
        passed: false,
      };
    }
  }
}

function makeTrainingObstacle(type: ObstacleType, id: number, z: number): Obstacle {
  switch (type) {
    case "gate":
      return { id: `gate-${id}`, type, position: { x: 0, y: 12, z }, width: 32, height: 22, depth: 8, passed: false };
    case "tunnel":
      return { id: `tunnel-${id}`, type, position: { x: 0, y: 14, z }, width: 32, height: 26, depth: 36, passed: false };
    case "bridge":
      return { id: `bridge-${id}`, type, position: { x: 0, y: 24, z }, width: 50, height: 5, depth: 16, passed: false };
    case "mountain":
      return { id: `mountain-${id}`, type, position: { x: -30, y: 3, z }, width: 24, height: 20, depth: 24, passed: false };
  }
}

function previousOpening(obstacles: Obstacle[], beforeZ: number): PreviousOpening {
  let best: Obstacle | null = null;
  for (const obstacle of obstacles) {
    if (obstacle.type !== "gate" && obstacle.type !== "tunnel") continue;
    if (obstacle.position.z <= beforeZ) continue;
    if (!best || obstacle.position.z < best.position.z) best = obstacle;
  }
  return best ? { x: best.position.x, y: best.position.y } : { x: 0, y: 12 };
}

export function createCourse(seed = 1): CourseState {
  const random = seeded(seed);
  const obstacles: Obstacle[] = [];
  let nextZ = -145;
  for (let i = 0; i < 14; i += 1) {
    const type = TYPES[i % TYPES.length];
    obstacles.push(
      i < 4
        ? makeTrainingObstacle(type, i + 1, nextZ)
        : makeObstacle(type, i + 1, nextZ, random, 0, previousOpening(obstacles, nextZ)),
    );
    nextZ -= SPACING + random() * 18;
  }

  return {
    seed,
    score: 0,
    nextId: obstacles.length + 1,
    nextZ,
    obstacles,
  };
}

export function getVisibleObstacles(course: CourseState, planeZ: number): Obstacle[] {
  return course.obstacles
    .filter((obstacle) => obstacle.position.z < planeZ + VISIBLE_BACK && obstacle.position.z > planeZ - VISIBLE_FRONT)
    .sort((a, b) => b.position.z - a.position.z);
}

export function updateCourse(course: CourseState, planeZ: number): void {
  const random = seeded(course.seed + course.nextId * 31);
  const difficulty = clamp(-planeZ / DIFFICULTY_RAMP, 0, 1);
  for (const obstacle of course.obstacles) {
    if (obstacle.position.z > planeZ + VISIBLE_BACK) {
      const type = TYPES[(course.nextId - 1) % TYPES.length];
      const previous = previousOpening(course.obstacles, course.nextZ);
      const replacement = makeObstacle(type, course.nextId, course.nextZ, random, difficulty, previous);
      Object.assign(obstacle, replacement);
      course.nextId += 1;
      course.nextZ -= SPACING - difficulty * 14 + random() * 18;
    }
  }
}
