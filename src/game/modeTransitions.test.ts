import { describe, expect, test } from "vitest";
import { shouldEscapeReturnToMenu, shouldStopCameraForMode } from "./modeTransitions";

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
});
