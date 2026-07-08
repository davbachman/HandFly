import { describe, expect, test } from "vitest";
import { shouldEscapeReturnToMenu, shouldReturnToMenuAfterCrash, shouldStopCameraForMode } from "./modeTransitions";

describe("mode transitions", () => {
  test("Escape quits active flight modes back to the menu", () => {
    expect(shouldEscapeReturnToMenu("practice")).toBe(true);
    expect(shouldEscapeReturnToMenu("flying")).toBe(true);
    expect(shouldEscapeReturnToMenu("shooting-gallery")).toBe(true);
    expect(shouldEscapeReturnToMenu("menu")).toBe(false);
    expect(shouldEscapeReturnToMenu("crashed")).toBe(false);
  });

  test("camera turns off when the game is stopped", () => {
    expect(shouldStopCameraForMode("menu")).toBe(true);
    expect(shouldStopCameraForMode("crashed")).toBe(true);
    expect(shouldStopCameraForMode("practice")).toBe(false);
    expect(shouldStopCameraForMode("flying")).toBe(false);
    expect(shouldStopCameraForMode("shooting-gallery")).toBe(false);
  });

  test("fatal crashes return to the original menu after the explosion delay", () => {
    expect(shouldReturnToMenuAfterCrash("crashed", 2099, 1000)).toBe(false);
    expect(shouldReturnToMenuAfterCrash("crashed", 2100, 1000)).toBe(true);
    expect(shouldReturnToMenuAfterCrash("menu", 2100, 1000)).toBe(false);
    expect(shouldReturnToMenuAfterCrash("flying", 2100, 1000)).toBe(false);
  });
});
