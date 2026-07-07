import type { HandInputState } from "../types";
import {
  continuousLineAngle,
  createEmptyHandInput,
  PITCH_FULL_SCALE,
  ROLL_FULL_SCALE,
  shapeAxis,
} from "./handMath";

const OPEN_GRACE_MS = 280;
const SMOOTHING = 0.45;
const CONTROL_HOLD_OPEN_SCORE = 0.3;
const FIXED_ROLL_NEUTRAL = 0;
const FIXED_PITCH_NEUTRAL = 0;

export interface HandControlSession {
  state: HandInputState;
  status: string;
  update: (raw: HandInputState, nowMs: number) => void;
}

export function createHandControlSession(): HandControlSession {
  const state = createEmptyHandInput();
  let status = "Show an open hand, fingers spread";
  let lastOpenMs = Number.NEGATIVE_INFINITY;
  let smoothRoll = 0;
  let smoothPitch = 0;
  let trackedRollAngle: number | null = null;
  let previousControlOpen = false;

  const update = (raw: HandInputState, nowMs: number): void => {
    let targetRoll = 0;
    let targetPitch = 0;
    let controlling = false;
    const rawOpen = raw.tracked && raw.openHand;
    const controlOpen = rawOpen || (raw.tracked && previousControlOpen && raw.openScore >= CONTROL_HOLD_OPEN_SCORE);
    const reacquiredOpenHand = controlOpen && !previousControlOpen;

    if (controlOpen) {
      lastOpenMs = nowMs;
      controlling = true;
      const rollAngle = continuousLineAngle(trackedRollAngle, raw.rollAngle);
      trackedRollAngle = rollAngle;
      targetRoll = shapeAxis(rollAngle - FIXED_ROLL_NEUTRAL, ROLL_FULL_SCALE);
      targetPitch = shapeAxis(raw.pitchAngle - FIXED_PITCH_NEUTRAL, PITCH_FULL_SCALE);
      status = "Hand control active";
    } else {
      const withinGrace = nowMs - lastOpenMs < OPEN_GRACE_MS;
      if (raw.tracked || !withinGrace) {
        trackedRollAngle = null;
      }
      if (withinGrace) {
        controlling = true;
        targetRoll = smoothRoll;
        targetPitch = smoothPitch;
      } else if (raw.tracked) {
        status = "Spread your fingers to take control";
      } else {
        status = "Show your hand to the camera";
      }
    }

    if (reacquiredOpenHand) {
      smoothRoll = targetRoll;
      smoothPitch = targetPitch;
    } else {
      smoothRoll += (targetRoll - smoothRoll) * SMOOTHING;
      smoothPitch += (targetPitch - smoothPitch) * SMOOTHING;
    }

    state.tracked = raw.tracked || controlling;
    state.openHand = controlling;
    state.confidence = raw.tracked ? raw.confidence : controlling ? 0.3 : 0;
    state.roll = smoothRoll;
    state.pitch = smoothPitch;
    state.fire = false;
    state.rollAngle = raw.rollAngle;
    state.pitchAngle = raw.pitchAngle;
    state.openScore = raw.openScore;
    state.thumbIndexDistance = raw.thumbIndexDistance;
    state.lastSeenMs = raw.tracked ? nowMs : state.lastSeenMs;
    state.source = state.tracked ? "mediapipe" : "none";
    previousControlOpen = controlOpen;
  };

  return {
    state,
    get status() {
      return status;
    },
    update,
  };
}
