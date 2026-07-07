import type { GameMode } from "../types";

export function shouldEscapeReturnToMenu(mode: GameMode): boolean {
  return mode === "practice" || mode === "flying" || mode === "shooting-gallery";
}

export function shouldStopCameraForMode(mode: GameMode): boolean {
  return mode === "menu" || mode === "crashed";
}
