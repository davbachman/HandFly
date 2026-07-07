import type { HandLandmarkerOptions } from "@mediapipe/tasks-vision";

export const VISION_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

export const HAND_LANDMARKER_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

export type HandLandmarkerDelegate = "GPU" | "CPU";

const REACQUISITION_CONFIDENCE = 0.35;

export function createHandLandmarkerOptions(delegate: HandLandmarkerDelegate): HandLandmarkerOptions {
  return {
    baseOptions: {
      modelAssetPath: HAND_LANDMARKER_MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: REACQUISITION_CONFIDENCE,
    minHandPresenceConfidence: REACQUISITION_CONFIDENCE,
    minTrackingConfidence: REACQUISITION_CONFIDENCE,
  };
}

export interface HandTrackerFrameDescription {
  hasVideoFrame: boolean;
  detectionHiccup: boolean;
  landmarkCount: number;
}

export function describeHandTrackerFrame(frame: HandTrackerFrameDescription): string | null {
  if (!frame.hasVideoFrame) {
    return "Waiting for camera video";
  }
  if (frame.detectionHiccup) {
    return "Tracking hiccup, recovering";
  }
  if (frame.landmarkCount === 0) {
    return "Camera active - looking for hand landmarks";
  }
  return null;
}
