import { describe, expect, test } from "vitest";
import { nextChaseCameraX } from "./cameraRig";

describe("chase camera lateral smoothing", () => {
  test("snaps to the reset plane position while the game is not actively flying", () => {
    expect(nextChaseCameraX(58, 0, 1 / 60, "menu")).toBe(0);
    expect(nextChaseCameraX(-58, 8, 1 / 60, "crashed")).toBe(8);
  });

  test("keeps camera lag during active flight modes", () => {
    const cameraX = nextChaseCameraX(58, 0, 1 / 60, "flying");

    expect(cameraX).toBeGreaterThan(0);
    expect(cameraX).toBeLessThan(58);
  });
});
