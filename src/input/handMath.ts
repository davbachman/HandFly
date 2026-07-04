import { clamp, distance2d } from "../math";
import type { HandInputState, HandLandmark } from "../types";

const NO_HAND: HandInputState = {
  tracked: false,
  openHand: false,
  confidence: 0,
  roll: 0,
  pitch: 0,
  lastSeenMs: 0,
  source: "none",
};

export function createEmptyHandInput(nowMs = 0): HandInputState {
  return { ...NO_HAND, lastSeenMs: nowMs };
}

function rollFromAxis(a: HandLandmark, b: HandLandmark): number {
  return clamp(Math.atan2(b.y - a.y, b.x - a.x), -1, 1);
}

function strongestRoll(...signals: number[]): number {
  const rawRoll = signals.reduce((strongest, signal) => (Math.abs(signal) > Math.abs(strongest) ? signal : strongest), 0);
  return Math.abs(rawRoll) < 0.06 ? 0 : rawRoll;
}

export function computeHandInputFromLandmarks(landmarks: HandLandmark[], nowMs: number, worldLandmarks: HandLandmark[] = []): HandInputState {
  if (landmarks.length < 21) {
    return createEmptyHandInput(nowMs);
  }

  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const indexMcp = landmarks[5];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  const ringMcp = landmarks[13];
  const ringTip = landmarks[16];
  const pinkyMcp = landmarks[17];
  const pinkyTip = landmarks[20];
  const palmSpan = Math.max(distance2d(thumbTip, pinkyTip), 0.001);

  const fingerTips = [indexTip, middleTip, ringTip, pinkyTip];
  const extensionScore =
    fingerTips.reduce((total, tip) => total + clamp(distance2d(wrist, tip) / (palmSpan * 0.5), 0, 1), 0) /
    fingerTips.length;
  const spreadScore =
    (clamp(distance2d(indexTip, middleTip) / (palmSpan * 0.18), 0, 1) +
      clamp(distance2d(middleTip, ringTip) / (palmSpan * 0.16), 0, 1) +
      clamp(distance2d(ringTip, pinkyTip) / (palmSpan * 0.14), 0, 1)) /
    3;
  const openHand = extensionScore > 0.72 && spreadScore > 0.55;
  const confidence = openHand ? clamp((extensionScore + spreadScore) / 2, 0, 1) : clamp(spreadScore * 0.45, 0, 0.45);

  const worldThumbTip = worldLandmarks[4];
  const worldIndexMcp = worldLandmarks[5];
  const worldPinkyMcp = worldLandmarks[17];
  const worldPinkyTip = worldLandmarks[20];
  const imageTipRoll = rollFromAxis(thumbTip, pinkyTip);
  const imageKnuckleRoll = rollFromAxis(indexMcp, pinkyMcp);
  const worldTipRoll = worldThumbTip && worldPinkyTip ? rollFromAxis(worldThumbTip, worldPinkyTip) : 0;
  const worldKnuckleRoll = worldIndexMcp && worldPinkyMcp ? rollFromAxis(worldIndexMcp, worldPinkyMcp) : 0;
  const roll = strongestRoll(imageTipRoll, imageKnuckleRoll, worldTipRoll, worldKnuckleRoll);

  const ringLift = (ringMcp.y - ringTip.y) / palmSpan;
  const neutralLift = 0.136;
  const pitch = clamp((ringLift - neutralLift) * 4.6, -1, 1);

  return {
    tracked: true,
    openHand,
    confidence,
    roll: openHand ? roll : 0,
    pitch: openHand ? pitch : 0,
    lastSeenMs: nowMs,
    source: "mediapipe",
  };
}
