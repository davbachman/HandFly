import { distance3d } from "../math";
import { HULL_SEGMENT } from "./flight";
import type { GameState } from "../types";

export const FIRE_COOLDOWN_MS = 190;
export const PROJECTILE_SPEED = 200;
export const PROJECTILE_LIFETIME_MS = 1500;
export const BALLOON_SCORE = 150;
// Generous hit slack: projectiles cover ~4.5 units per frame, so the pad
// keeps fast tracers from tunneling straight through a balloon.
const PROJECTILE_HIT_PAD = 2.2;
const BALLOON_RAM_DAMAGE_COOLDOWN_MS = 1500;

export function updateProjectilesAndBalloons(state: GameState, dt: number): void {
  if (!state.options.targetsEnabled) {
    state.projectiles = [];
    return;
  }

  const { plane } = state;

  if (state.command.fire && state.elapsedMs - state.lastFireMs >= FIRE_COOLDOWN_MS) {
    state.lastFireMs = state.elapsedMs;
    state.projectiles.push({
      id: state.nextProjectileId,
      position: { x: plane.position.x, y: plane.position.y, z: plane.position.z - 6 },
      // Inherit a share of the plane's lateral motion so shots go roughly
      // where the plane is pointed.
      velocity: {
        x: plane.velocity.x * 0.35,
        y: plane.velocity.y * 0.35,
        z: -(plane.speed + PROJECTILE_SPEED),
      },
      expiresAtMs: state.elapsedMs + PROJECTILE_LIFETIME_MS,
    });
    state.nextProjectileId += 1;
    state.events.push({ type: "shot" });
  }

  for (const projectile of state.projectiles) {
    projectile.position.x += projectile.velocity.x * dt;
    projectile.position.y += projectile.velocity.y * dt;
    projectile.position.z += projectile.velocity.z * dt;
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.expiresAtMs > state.elapsedMs);

  for (const balloon of state.course.balloons) {
    if (balloon.popped) continue;
    const shot = state.projectiles.find(
      (projectile) => distance3d(projectile.position, balloon.position) <= balloon.radius + PROJECTILE_HIT_PAD,
    );
    const rammed = distance3d(plane.position, balloon.position) <= balloon.radius + plane.radius;
    if (!shot && !rammed) continue;

    balloon.popped = true;
    if (shot) {
      state.projectiles = state.projectiles.filter((projectile) => projectile !== shot);
    }
    if (shot && state.options.balloonMode === "obstacle-course") {
      state.plane.health = Math.min(1, state.plane.health + HULL_SEGMENT);
      state.events.push({ type: "repair", position: { ...balloon.position } });
      continue;
    }
    if (!shot && (state.mode === "shooting-gallery" || state.mode === "flying")) {
      if (state.elapsedMs - state.lastHitMs >= BALLOON_RAM_DAMAGE_COOLDOWN_MS) {
        state.lastHitMs = state.elapsedMs;
        state.plane.health = Math.max(0, state.plane.health - HULL_SEGMENT);
        if (state.plane.health <= 0.001) {
          state.mode = "crashed";
          state.crashReason = "Hit a balloon.";
          state.events.push({ type: "explosion", position: { ...balloon.position } });
        } else {
          state.events.push({ type: "hit", position: { ...balloon.position } });
        }
      }
      continue;
    }
    state.course.score += BALLOON_SCORE;
    state.events.push({ type: "balloon-pop", position: { ...balloon.position } });
  }
}
