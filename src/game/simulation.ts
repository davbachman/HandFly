import { checkCourseCollision, updateObstaclePasses } from "./collision";
import { updateCourse } from "./course";
import { deriveFlightCommand, updatePlane } from "./flight";
import type { GameState } from "../types";

export function stepGame(state: GameState, dt: number): void {
  state.elapsedMs += dt * 1000;

  if (state.mode !== "flying") {
    state.command = deriveFlightCommand(state.hand, state.keyboard);
    return;
  }

  state.command = deriveFlightCommand(state.hand, state.keyboard);
  updatePlane(state.plane, state.command, dt);
  updateObstaclePasses(state.course, state.plane);
  updateCourse(state.course, state.plane.position.z);

  const collision = checkCourseCollision(state.course, state.plane);
  if (collision) {
    state.mode = "crashed";
    state.plane.health = 0;
    state.crashReason = `Hit ${collision.type} ${collision.id}`;
  }
}

export function resetGameState(state: GameState, fresh: GameState): void {
  Object.assign(state, fresh);
}

