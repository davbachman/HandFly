import { checkCourseCollision, updateObstaclePasses } from "./collision";
import { updateCourse } from "./course";
import { deriveFlightCommand, HULL_SEGMENT, MIN_ALTITUDE, updatePlane } from "./flight";
import { updateProjectilesAndBalloons } from "./projectiles";
import type { GameState } from "../types";

// Three hits down the plane; between hits there is a short grace window so
// one obstacle cannot drain the whole hull in consecutive frames.
export const HIT_DAMAGE = HULL_SEGMENT;
export const INVULNERABLE_MS = 1500;

function applyHitDamage(state: GameState, cause: string, bounceGround = false): void {
  if (state.elapsedMs - state.lastHitMs < INVULNERABLE_MS) return;
  state.lastHitMs = state.elapsedMs;
  state.plane.health = Math.max(0, state.plane.health - HIT_DAMAGE);
  if (state.plane.health <= 0.001) {
    state.mode = "crashed";
    state.crashReason = `Hit the ${cause}.`;
    state.events.push({ type: "explosion", position: { ...state.plane.position } });
  } else {
    state.events.push({ type: "hit" });
    if (bounceGround) {
      state.plane.position.y = MIN_ALTITUDE + 2.4;
      state.plane.pitch = Math.max(state.plane.pitch, 0.12);
    }
  }
}

export function stepGame(state: GameState, dt: number): void {
  state.elapsedMs += dt * 1000;

  if (state.mode === "practice") {
    state.command = deriveFlightCommand(state.hand, state.keyboard);
    updatePlane(state.plane, state.command, dt);
    return;
  }

  if (state.mode === "shooting-gallery") {
    state.command = deriveFlightCommand(state.hand, state.keyboard);
    updatePlane(state.plane, state.command, dt);
    updateProjectilesAndBalloons(state, dt);
    if (state.mode !== "shooting-gallery") return;
    updateCourse(state.course, state.plane.position.z);
    if (state.plane.position.y <= MIN_ALTITUDE + 0.01) {
      applyHitDamage(state, "ground", true);
    }
    return;
  }

  if (state.mode !== "flying") {
    state.command = deriveFlightCommand(state.hand, state.keyboard);
    return;
  }

  state.command = deriveFlightCommand(state.hand, state.keyboard);
  updatePlane(state.plane, state.command, dt);
  const passes = updateObstaclePasses(state.course, state.plane);
  for (let i = 0; i < passes.threaded; i += 1) state.events.push({ type: "pass-threaded" });
  for (let i = 0; i < passes.bypassed; i += 1) state.events.push({ type: "pass-bypassed" });
  updateProjectilesAndBalloons(state, dt);
  updateCourse(state.course, state.plane.position.z);

  const collision = checkCourseCollision(state.course, state.plane);
  const grounded = state.plane.position.y <= MIN_ALTITUDE + 0.01;
  if (collision || grounded) {
    const cause = collision ? collision.type : "ground";
    // Bounce off the deck with the nose nudged up so the plane does not
    // slam straight back down.
    applyHitDamage(state, cause, grounded && !collision);
  }
}

export function resetGameState(state: GameState, fresh: GameState): void {
  Object.assign(state, fresh);
}
