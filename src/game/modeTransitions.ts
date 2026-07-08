import type { GameMode } from "../types";

export const CRASH_RETURN_DELAY_MS = 1100;

export function shouldEscapeReturnToMenu(mode: GameMode): boolean {
  return mode === "practice" || mode === "flying" || mode === "shooting-gallery";
}

export function shouldStopCameraForMode(mode: GameMode): boolean {
  return mode === "menu" || mode === "crashed";
}

export function shouldReturnToMenuAfterCrash(mode: GameMode, elapsedMs: number, lastHitMs: number): boolean {
  return mode === "crashed" && elapsedMs - lastHitMs >= CRASH_RETURN_DELAY_MS;
}
