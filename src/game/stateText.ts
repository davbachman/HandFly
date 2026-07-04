import { round } from "../math";
import { createCourse, getVisibleObstacles } from "./course";
import { createInitialPlaneState, createNeutralKeyboardInput } from "./flight";
import type { FlightCommand, GameState, HandInputState } from "../types";

function emptyHand(): HandInputState {
  return {
    tracked: false,
    openHand: false,
    confidence: 0,
    roll: 0,
    pitch: 0,
    rollAngle: 0,
    pitchAngle: 0,
    openScore: 0,
    lastSeenMs: 0,
    source: "none",
  };
}

function emptyCommand(): FlightCommand {
  return {
    roll: 0,
    pitch: 0,
    fire: false,
    boost: false,
    source: "none",
    confidence: 0,
  };
}

export function createGameState(seed = 11): GameState {
  return {
    mode: "menu",
    plane: createInitialPlaneState(),
    course: createCourse(seed),
    hand: emptyHand(),
    keyboard: createNeutralKeyboardInput(),
    command: emptyCommand(),
    elapsedMs: 0,
    debugVisible: false,
    crashReason: null,
  };
}

export function renderGameStateToText(state: GameState): string {
  const visible = getVisibleObstacles(state.course, state.plane.position.z).slice(0, 8);
  return JSON.stringify({
    coordinateSystem: "Babylon-style world; x right, y up, z decreases forward from the rear chase camera.",
    mode: state.mode,
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
      boost: state.command.boost,
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
    crashReason: state.crashReason,
  });
}

