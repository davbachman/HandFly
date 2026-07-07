import { round } from "../math";
import { createCourse, getVisibleObstacles } from "./course";
import { createInitialPlaneState, createNeutralKeyboardInput } from "./flight";
import type { FlightCommand, GameOptions, GameState, HandInputState } from "../types";

function emptyHand(): HandInputState {
  return {
    tracked: false,
    openHand: false,
    confidence: 0,
    roll: 0,
    pitch: 0,
    fire: false,
    rollAngle: 0,
    pitchAngle: 0,
    openScore: 0,
    thumbIndexDistance: 0,
    lastSeenMs: 0,
    source: "none",
  };
}

function emptyCommand(): FlightCommand {
  return {
    roll: 0,
    pitch: 0,
    fire: false,
    source: "none",
    confidence: 0,
  };
}

const DEFAULT_GAME_OPTIONS: GameOptions = {
  targetsEnabled: false,
  balloonMode: "none",
};

function resolveGameOptions(options: Partial<GameOptions>): GameOptions {
  const resolved: GameOptions = { ...DEFAULT_GAME_OPTIONS, ...options };
  if (!resolved.targetsEnabled) {
    resolved.balloonMode = "none";
  } else if (resolved.balloonMode === "none") {
    resolved.balloonMode = "gallery";
  }
  return resolved;
}

export function createGameState(seed = 11, options: Partial<GameOptions> = {}): GameState {
  const resolvedOptions = resolveGameOptions(options);
  return {
    mode: "menu",
    options: resolvedOptions,
    plane: createInitialPlaneState(),
    course: createCourse(seed, resolvedOptions),
    hand: emptyHand(),
    keyboard: createNeutralKeyboardInput(),
    command: emptyCommand(),
    projectiles: [],
    nextProjectileId: 1,
    lastFireMs: Number.NEGATIVE_INFINITY,
    events: [],
    elapsedMs: 0,
    lastHitMs: Number.NEGATIVE_INFINITY,
    debugVisible: false,
    crashReason: null,
  };
}

export function createPracticeModeState(seed = 11): GameState {
  const state = createGameState(seed, { targetsEnabled: false });
  state.mode = "practice";
  state.course.obstacles = [];
  state.course.balloons = [];
  state.projectiles = [];
  state.debugVisible = true;
  return state;
}

export function createObstacleCourseState(seed = 11): GameState {
  const state = createGameState(seed, { targetsEnabled: true, balloonMode: "obstacle-course" });
  state.mode = "flying";
  return state;
}

export function createShootingGalleryState(seed = 11): GameState {
  const state = createGameState(seed, { targetsEnabled: true, balloonMode: "gallery" });
  state.mode = "shooting-gallery";
  state.course.obstacles = [];
  state.projectiles = [];
  return state;
}

export function renderGameStateToText(state: GameState): string {
  const visible = getVisibleObstacles(state.course, state.plane.position.z).slice(0, 8);
  return JSON.stringify({
    coordinateSystem: "Babylon-style world; x right, y up, z decreases forward from the rear chase camera.",
    mode: state.mode,
    options: {
      targetsEnabled: state.options.targetsEnabled,
      balloonMode: state.options.balloonMode,
    },
    debugVisible: state.debugVisible,
    plane: {
      x: round(state.plane.position.x),
      y: round(state.plane.position.y),
      z: round(state.plane.position.z),
      roll: round(state.plane.roll),
      pitch: round(state.plane.pitch),
      speed: round(state.plane.speed),
      health: round(state.plane.health),
    },
    score: state.course.score,
    tracking: {
      tracked: state.hand.tracked,
      openHand: state.hand.openHand,
      confidence: round(state.hand.confidence),
      roll: round(state.hand.roll),
      pitch: round(state.hand.pitch),
    },
    controls: {
      roll: round(state.command.roll),
      pitch: round(state.command.pitch),
      fire: state.command.fire,
      source: state.command.source,
    },
    obstacles: visible.map((obstacle) => ({
      id: obstacle.id,
      type: obstacle.type,
      x: round(obstacle.position.x),
      y: round(obstacle.position.y),
      z: round(obstacle.position.z),
      width: round(obstacle.width),
      height: round(obstacle.height),
      passed: obstacle.passed,
    })),
    balloons: state.course.balloons
      .filter((balloon) => !balloon.popped && balloon.position.z < state.plane.position.z && balloon.position.z > state.plane.position.z - 500)
      .slice(0, 3)
      .map((balloon) => ({
        id: balloon.id,
        kind: balloon.kind,
        x: round(balloon.position.x),
        y: round(balloon.position.y),
        z: round(balloon.position.z),
      })),
    projectiles: state.projectiles.length,
    crashReason: state.crashReason,
  });
}
