import type { KeyboardInputState } from "../types";

export interface KeyboardController {
  state: KeyboardInputState;
  dispose: () => void;
}

export function createKeyboardController(target: Window = window): KeyboardController {
  const pressed = new Set<string>();
  const state: KeyboardInputState = {
    rollAxis: 0,
    pitchAxis: 0,
    fire: false,
    boost: false,
  };

  const updateState = (): void => {
    const left = pressed.has("ArrowLeft") || pressed.has("KeyA");
    const right = pressed.has("ArrowRight") || pressed.has("KeyD");
    const up = pressed.has("ArrowUp") || pressed.has("KeyW");
    const down = pressed.has("ArrowDown") || pressed.has("KeyS");
    state.rollAxis = (right ? 1 : 0) - (left ? 1 : 0);
    state.pitchAxis = (up ? 1 : 0) - (down ? 1 : 0);
    state.fire = pressed.has("Space");
    state.boost = pressed.has("ShiftLeft") || pressed.has("ShiftRight");
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    pressed.add(event.code);
    updateState();
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    pressed.delete(event.code);
    updateState();
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);

  return {
    state,
    dispose: () => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
    },
  };
}

