import { clamp, distance3d, meanLineAngle, normalizeLineAngle } from "../math";
import type { HandInputState, HandLandmark } from "../types";

// Landmarks arrive in raw (non-mirrored) image coordinates: x grows right,
// y grows DOWN, z grows away from the camera (fingertips pointing at the
// lens have negative z relative to the wrist). Because the feed is not
// mirrored, a tilt the player perceives as clockwise appears
// counterclockwise in landmark space — every image-plane angle is negated
// before it becomes a control signal.

const NO_HAND: HandInputState = {
  tracked: false,
  openHand: false,
  confidence: 0,
  roll: 0,
  pitch: 0,
  fire: false,
  rollAngle: 0,
  pitchAngle: 0,
  openScore: 0,
  thumbIndexDistance: 0,
  lastSeenMs: 0,
  source: "none",
};

// Full control deflection at ~55 degrees of hand tilt and ~40 degrees of
// finger pitch — steep enough to avoid twitchiness, shallow enough to reach
// full bank without contorting the wrist.
export const ROLL_FULL_SCALE = Math.PI * 0.31;
export const PITCH_FULL_SCALE = Math.PI * 0.23;
const AXIS_DEADZONE = 0.06;
const AXIS_EXPO = 0.35;
const OPEN_SCORE_THRESHOLD = 0.5;
const FIXED_ROLL_NEUTRAL = 0;
const FIXED_PITCH_NEUTRAL = 0;

export function createEmptyHandInput(nowMs = 0): HandInputState {
  return { ...NO_HAND, lastSeenMs: nowMs };
}

// Undirected line angles wrap at +-90 degrees, so a hand banked past
// vertical would suddenly read as a hard opposite bank. Given the previous
// frame's angle, pick the wrap candidate that continues the motion, capped
// so the angle cannot wind up forever.
const MAX_CONTINUOUS_ANGLE = Math.PI * 0.72;

export function continuousLineAngle(previous: number | null, wrapped: number): number {
  if (previous === null) {
    return wrapped;
  }
  let best = wrapped;
  for (const candidate of [wrapped - Math.PI, wrapped + Math.PI]) {
    if (Math.abs(candidate - previous) < Math.abs(best - previous)) {
      best = candidate;
    }
  }
  return clamp(best, -MAX_CONTINUOUS_ANGLE, MAX_CONTINUOUS_ANGLE);
}

// Deadzone plus expo curve: soft around neutral, still reaches +-1.
export function shapeAxis(angleRad: number, fullScaleRad: number): number {
  const normalized = clamp(angleRad / fullScaleRad, -1, 1);
  const magnitude = Math.abs(normalized);
  if (magnitude < AXIS_DEADZONE) return 0;
  const scaled = (magnitude - AXIS_DEADZONE) / (1 - AXIS_DEADZONE);
  const curved = (1 - AXIS_EXPO) * scaled + AXIS_EXPO * scaled ** 3;
  return Math.sign(normalized) * curved;
}

// Undirected image-plane angle of the a->b line, wrapped to [-pi/2, pi/2].
// Undirected matters: thumb->pinky points the opposite way on the two
// hands, and raw atan2 would saturate a level right hand at full bank.
function lineAngle(a: HandLandmark, b: HandLandmark): number {
  return normalizeLineAngle(Math.atan2(b.y - a.y, b.x - a.x));
}

export function computeHandInputFromLandmarks(
  landmarks: HandLandmark[],
  nowMs: number,
): HandInputState {
  if (landmarks.length < 21) {
    return createEmptyHandInput(nowMs);
  }

  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const indexMcp = landmarks[5];
  const indexTip = landmarks[8];
  const middleMcp = landmarks[9];
  const middleTip = landmarks[12];
  const ringMcp = landmarks[13];
  const ringTip = landmarks[16];
  const pinkyMcp = landmarks[17];
  const pinkyTip = landmarks[20];

  // Open-hand detection must survive foreshortening (fingers aimed at the
  // camera), so it works from 3D ratios instead of 2D screen distances:
  // spread = adjacent tip gaps vs. rigid knuckle span, reach = wrist->tip
  // vs. wrist->knuckle length per finger (curled fingers fall below 1).
  const knuckleSpan = Math.max(distance3d(indexMcp, pinkyMcp), 0.03);
  const tipGaps =
    (distance3d(indexTip, middleTip) + distance3d(middleTip, ringTip) + distance3d(ringTip, pinkyTip)) / 3;
  const spreadScore = clamp((tipGaps / knuckleSpan - 0.22) / 0.3, 0, 1);
  const fingers: Array<[HandLandmark, HandLandmark]> = [
    [indexMcp, indexTip],
    [middleMcp, middleTip],
    [ringMcp, ringTip],
    [pinkyMcp, pinkyTip],
  ];
  const reach =
    fingers.reduce(
      (total, [mcp, tip]) => total + distance3d(wrist, tip) / Math.max(distance3d(wrist, mcp), 0.02),
      0,
    ) / fingers.length;
  const reachScore = clamp((reach - 0.85) / 0.35, 0, 1);
  const openScore = spreadScore * 0.55 + reachScore * 0.45;
  const openHand = openScore >= OPEN_SCORE_THRESHOLD;
  const confidence = openHand ? clamp(0.4 + openScore * 0.6, 0, 1) : openScore * 0.5;
  const thumbIndexDistance = distance3d(thumbTip, indexTip) / knuckleSpan;

  // Roll: blend the rigid knuckle line with the wider thumb->pinky line,
  // then negate to convert from raw-image space to the player's view.
  const knuckleRoll = lineAngle(indexMcp, pinkyMcp);
  const tipRoll = lineAngle(thumbTip, pinkyTip);
  const rollAngle = -meanLineAngle(knuckleRoll, tipRoll, 0.6);

  // Pitch: how far the middle+ring fingers point above or below the camera
  // axis. Elevation is measured along the palm-up direction (perpendicular
  // to the knuckle line) so it stays correct while the hand is banked, and
  // atan2 against the toward-camera z component self-normalizes — no magic
  // neutral constant, no dependence on hand size or distance.
  const knuckleDir = { x: pinkyMcp.x - indexMcp.x, y: pinkyMcp.y - indexMcp.y };
  const knuckleLen = Math.hypot(knuckleDir.x, knuckleDir.y) || 1;
  let palmUp = { x: -knuckleDir.y / knuckleLen, y: knuckleDir.x / knuckleLen };
  if (palmUp.y > 0) {
    palmUp = { x: -palmUp.x, y: -palmUp.y };
  }
  const pitchFingers: Array<[HandLandmark, HandLandmark]> = [
    [middleMcp, middleTip],
    [ringMcp, ringTip],
  ];
  let elevation = 0;
  let towardCamera = 0;
  for (const [mcp, tip] of pitchFingers) {
    elevation += (tip.x - mcp.x) * palmUp.x + (tip.y - mcp.y) * palmUp.y;
    towardCamera += Math.max(0.015, mcp.z - tip.z);
  }
  const pitchAngle = Math.atan2(elevation / pitchFingers.length, towardCamera / pitchFingers.length);

  const roll = shapeAxis(rollAngle - FIXED_ROLL_NEUTRAL, ROLL_FULL_SCALE);
  const pitch = shapeAxis(pitchAngle - FIXED_PITCH_NEUTRAL, PITCH_FULL_SCALE);

  return {
    tracked: true,
    openHand,
    confidence,
    roll: openHand ? roll : 0,
    pitch: openHand ? pitch : 0,
    fire: false,
    rollAngle,
    pitchAngle,
    openScore,
    thumbIndexDistance,
    lastSeenMs: nowMs,
    source: "mediapipe",
  };
}
