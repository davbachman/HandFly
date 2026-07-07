import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function splashMarkup(): string {
  return readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/\s+/g, " ");
}

describe("splash screen instructions", () => {
  test("describe the current fixed-neutral hand controls and modes", () => {
    const markup = splashMarkup();

    expect(markup).toContain("Hold a level open hand in view");
    expect(markup).toContain("fingertips aimed toward the camera");
    expect(markup).toContain("Tilt left or right to bank");
    expect(markup).toContain("tip your fingers up or down to climb or dive");
    expect(markup).toContain("Space fires in Obstacle Course and Shooting Gallery");
    expect(markup).toContain("Esc quits active modes to the menu");
    expect(markup).toContain("Obstacle Course");
    expect(markup).toContain("id=\"start-btn\"");
    expect(markup).toContain("Flying Practice has no obstacles and shows the live camera/hand landmarks");
    expect(markup.indexOf("id=\"practice-btn\"")).toBeLessThan(markup.indexOf("id=\"start-btn\""));
    expect(markup).toContain("Shooting Gallery has balloons only");
    expect(markup).toContain("id=\"gallery-btn\"");
    expect(markup.indexOf("id=\"practice-btn\"")).toBeLessThan(markup.indexOf("id=\"gallery-btn\""));
    expect(markup.indexOf("id=\"gallery-btn\"")).toBeLessThan(markup.indexOf("id=\"start-btn\""));
    expect(markup).toContain('title="Fly freely with no obstacles and a live camera preview."');
    expect(markup).toContain('title="Shoot balloon targets before they hit you."');
    expect(markup).toContain('title="Fly the full obstacle course with repair balloons."');
    expect(markup).not.toContain("targets-toggle");
    expect(markup).not.toContain("Target practice balloons");
    expect(markup).not.toMatch(/boost/i);
    expect(markup).not.toMatch(/thumb|index finger|pinch|fallback/i);
    expect(markup).not.toMatch(/calibrat|ring finger/i);
  });
});
