import { describe, expect, test } from "vitest";
import { createKeyboardController } from "./keyboard";

function keyEvent(type: string, code: string): Event {
  return Object.assign(new Event(type), { code });
}

describe("createKeyboardController", () => {
  test("tracks presses and releases", () => {
    const target = new EventTarget();
    const controller = createKeyboardController(target as unknown as Window);

    target.dispatchEvent(keyEvent("keydown", "ArrowUp"));
    expect(controller.state.pitchAxis).toBe(1);
    target.dispatchEvent(keyEvent("keyup", "ArrowUp"));
    expect(controller.state.pitchAxis).toBe(0);

    controller.dispose();
  });

  test("releases latched keys when focus is lost", () => {
    const target = new EventTarget();
    const controller = createKeyboardController(target as unknown as Window);

    target.dispatchEvent(keyEvent("keydown", "KeyD"));
    expect(controller.state.rollAxis).toBe(1);

    // The keyups never arrive (window lost focus); blur must clear the
    // latch, otherwise the stuck axis overrides hand input forever.
    target.dispatchEvent(new Event("blur"));
    expect(controller.state.rollAxis).toBe(0);

    controller.dispose();
  });

  test("ignores Shift now that boost is removed", () => {
    const target = new EventTarget();
    const controller = createKeyboardController(target as unknown as Window);

    target.dispatchEvent(keyEvent("keydown", "ShiftLeft"));

    expect(controller.state).toMatchObject({ rollAxis: 0, pitchAxis: 0, fire: false });
    expect("boost" in controller.state).toBe(false);

    controller.dispose();
  });
});
