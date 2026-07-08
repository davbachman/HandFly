import { describe, expect, test } from "vitest";
import { engineGainForMode } from "./audio";

describe("audio mode levels", () => {
  test("menu and stopped crash states have no engine sound", () => {
    expect(engineGainForMode("menu")).toBe(0);
    expect(engineGainForMode("crashed")).toBe(0);
  });

  test("active flight modes keep the engine audible", () => {
    expect(engineGainForMode("flying")).toBeGreaterThan(0);
    expect(engineGainForMode("shooting-gallery")).toBeGreaterThan(0);
    expect(engineGainForMode("practice")).toBeGreaterThan(0);
  });
});
