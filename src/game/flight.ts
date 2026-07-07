import { clamp, damp } from "../math";
import type { FlightCommand, HandInputState, KeyboardInputState, PlaneState } from "../types";

export const CRUISE_SPEED = 72;
// Altitude floor; sitting on it means the plane is scraping the ground.
export const MIN_ALTITUDE = 2.6;
// One third of the hull: the cost of a collision and the value of a repair.
export const HULL_SEGMENT = 0.34;

// The chase camera looks down -z, so in Babylon's left-handed world the
// screen-right direction is -x. Positive roll = bank right on screen.

export function createInitialPlaneState(): PlaneState {
  return {
    position: { x: 0, y: 12, z: 0 },
    velocity: { x: 0, y: 0, z: -CRUISE_SPEED },
    roll: 0,
    pitch: 0,
    yaw: 0,
    speed: CRUISE_SPEED,
    health: 1,
    radius: 2.4,
  };
}

export function createNeutralKeyboardInput(): KeyboardInputState {
  return {
    rollAxis: 0,
    pitchAxis: 0,
    fire: false,
  };
}

export function deriveFlightCommand(hand: HandInputState, keyboard: KeyboardInputState): FlightCommand {
  const keyboardSteering = Math.abs(keyboard.rollAxis) > 0.001 || Math.abs(keyboard.pitchAxis) > 0.001;

  // Held steering keys are always deliberate, so they win over a tracked hand;
  // Space still merges into hand flight without stealing the stick.
  if (!keyboardSteering && hand.tracked && hand.openHand) {
    return {
      roll: clamp(hand.roll, -1, 1),
      pitch: clamp(hand.pitch, -1, 1),
      fire: keyboard.fire,
      source: "hand",
      confidence: hand.confidence,
    };
  }

  if (keyboardSteering || keyboard.fire) {
    return {
      roll: clamp(keyboard.rollAxis, -1, 1),
      pitch: clamp(keyboard.pitchAxis, -1, 1),
      fire: keyboard.fire,
      source: "keyboard",
      confidence: 1,
    };
  }

  return {
    roll: 0,
    pitch: 0,
    fire: false,
    source: "none",
    confidence: 0,
  };
}

export function updatePlane(plane: PlaneState, command: FlightCommand, dt: number): void {
  const maxBank = Math.PI / 3;
  const maxPitch = Math.PI / 5.5;
  const targetRoll = clamp(command.roll, -1, 1) * maxBank;
  const targetPitch = clamp(command.pitch, -1, 1) * maxPitch;

  plane.roll = damp(plane.roll, targetRoll, 6, dt);
  plane.pitch = damp(plane.pitch, targetPitch, 5, dt);
  // Cosmetic coordinated-turn yaw: nose leans into the bank and returns to
  // center, instead of integrating forever and flying sideways.
  plane.yaw = damp(plane.yaw, plane.roll * 0.34, 3.2, dt);
  plane.speed = damp(plane.speed, CRUISE_SPEED, 2.2, dt);

  // Bank right (positive roll) moves screen-right, which is -x.
  plane.velocity.x = -Math.sin(plane.roll) * plane.speed * 0.72;
  plane.velocity.y = Math.sin(plane.pitch) * plane.speed * 0.62;
  plane.velocity.z = -plane.speed;

  plane.position.x = clamp(plane.position.x + plane.velocity.x * dt, -58, 58);
  plane.position.y = clamp(plane.position.y + plane.velocity.y * dt, MIN_ALTITUDE, 58);
  plane.position.z += plane.velocity.z * dt;
}
