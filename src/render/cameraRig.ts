import { damp } from "../math";
import type { GameMode } from "../types";

export function isActiveFlightMode(mode: GameMode): boolean {
  return mode === "flying" || mode === "shooting-gallery" || mode === "practice";
}

export function nextChaseCameraX(previousCameraX: number, planeX: number, dt: number, mode: GameMode): number {
  return isActiveFlightMode(mode) ? damp(previousCameraX, planeX, 7.5, dt) : planeX;
}
