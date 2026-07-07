import { describe, expect, test } from "vitest";
import { TERRAIN_GROUND_Y, TERRAIN_STRIP_SURFACE_Y } from "./terrainDepth";

describe("terrain depth layering", () => {
  test("decorative strips sit far enough above ground to avoid depth fighting", () => {
    expect(TERRAIN_STRIP_SURFACE_Y - TERRAIN_GROUND_Y).toBeGreaterThanOrEqual(0.18);
  });
});
