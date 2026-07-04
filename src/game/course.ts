import type { CourseState, Obstacle, ObstacleType } from "../types";

const TYPES: ObstacleType[] = ["gate", "tunnel", "bridge", "mountain"];
const SPACING = 68;
const VISIBLE_BACK = 90;
const VISIBLE_FRONT = 700;

function seeded(seed: number): () => number {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function makeObstacle(type: ObstacleType, id: number, z: number, random: () => number): Obstacle {
  const side = random() > 0.5 ? 1 : -1;
  const x = side * (5 + random() * 16);
  const y = 10 + random() * 20;

  switch (type) {
    case "gate":
      return { id: `gate-${id}`, type, position: { x, y, z }, width: 25, height: 18, depth: 8, passed: false };
    case "tunnel":
      return { id: `tunnel-${id}`, type, position: { x: x * 0.55, y, z }, width: 28, height: 23, depth: 36, passed: false };
    case "bridge":
      return {
        id: `bridge-${id}`,
        type,
        position: { x: 0, y: 13 + random() * 18, z },
        width: 46,
        height: 6,
        depth: 16,
        passed: false,
      };
    case "mountain":
      return {
        id: `mountain-${id}`,
        type,
        position: { x: side * (8 + random() * 18), y: 3, z },
        width: 24 + random() * 15,
        height: 18 + random() * 19,
        depth: 24,
        passed: false,
      };
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

export function createCourse(seed = 1): CourseState {
  const random = seeded(seed);
  const obstacles: Obstacle[] = [];
  let nextZ = -145;
  for (let i = 0; i < 14; i += 1) {
    const type = TYPES[i % TYPES.length];
    obstacles.push(i < 4 ? makeTrainingObstacle(type, i + 1, nextZ) : makeObstacle(type, i + 1, nextZ, random));
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
  for (const obstacle of course.obstacles) {
    if (obstacle.position.z > planeZ + VISIBLE_BACK) {
      const type = TYPES[(course.nextId - 1) % TYPES.length];
      const replacement = makeObstacle(type, course.nextId, course.nextZ, random);
      Object.assign(obstacle, replacement);
      course.nextId += 1;
      course.nextZ -= SPACING + random() * 18;
    }
  }
}
