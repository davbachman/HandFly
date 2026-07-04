import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { clamp } from "../math";
import { computeHandInputFromLandmarks, createEmptyHandInput, NEUTRAL_CALIBRATION } from "./handMath";
import type { HandCalibration, HandInputState, HandLandmark } from "../types";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

// Hold an open hand this long to capture the player's neutral pose. Camera
// height and wrist posture vary per person, so "level" is measured, not
// assumed.
const CALIBRATION_HOLD_MS = 700;
// Keep flying through brief tracking dips instead of snapping level.
const OPEN_GRACE_MS = 280;
// Exponential smoothing per camera frame (~30 Hz) to damp landmark jitter.
const SMOOTHING = 0.45;

export interface HandTracker {
  state: HandInputState;
  status: string;
  calibrated: boolean;
  initialize: () => Promise<void>;
  recalibrate: () => void;
  update: (nowMs: number, debugVisible: boolean) => void;
  dispose: () => void;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function createHandTracker(video: HTMLVideoElement, debugCanvas: HTMLCanvasElement): HandTracker {
  let landmarker: HandLandmarker | null = null;
  let stream: MediaStream | null = null;
  let lastVideoTime = -1;
  let lastDetectMs = 0;
  let latestLandmarks: HandLandmark[] = [];
  let status = "Camera idle";
  const state = createEmptyHandInput();

  let calibration: HandCalibration | null = null;
  let calibrationStartMs = 0;
  let rollSamples: number[] = [];
  let pitchSamples: number[] = [];
  let lastOpenMs = Number.NEGATIVE_INFINITY;
  let smoothRoll = 0;
  let smoothPitch = 0;

  const resetCalibration = (): void => {
    calibration = null;
    calibrationStartMs = 0;
    rollSamples = [];
    pitchSamples = [];
  };

  const initialize = async (): Promise<void> => {
    try {
      status = "Loading hand tracker";
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
      );
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
      });

      status = "Requesting camera";
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      status = "Show an open hand, fingers spread";
    } catch (error) {
      status = error instanceof Error ? `Camera fallback: ${error.message}` : "Camera fallback active";
      Object.assign(state, createEmptyHandInput(performance.now()));
    }
  };

  const drawDebug = (debugVisible: boolean): void => {
    const ctx = debugCanvas.getContext("2d");
    if (!ctx) return;

    const width = debugCanvas.clientWidth || 220;
    const height = debugCanvas.clientHeight || 165;
    if (debugCanvas.width !== width || debugCanvas.height !== height) {
      debugCanvas.width = width;
      debugCanvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);
    if (!debugVisible) return;

    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      ctx.drawImage(video, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#101820";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();

    if (latestLandmarks.length > 0) {
      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.strokeStyle = "rgba(255,255,255,0.82)";
      ctx.lineWidth = 2;
      for (const connection of HandLandmarker.HAND_CONNECTIONS) {
        const a = latestLandmarks[connection.start];
        const b = latestLandmarks[connection.end];
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x * width, a.y * height);
        ctx.lineTo(b.x * width, b.y * height);
        ctx.stroke();
      }
      ctx.fillStyle = state.openHand ? "#66f0a3" : "#ffbd5a";
      for (const point of latestLandmarks) {
        ctx.beginPath();
        ctx.arc(point.x * width, point.y * height, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Artificial-horizon widget mirroring the control values actually sent
    // to the plane: bar tilts with roll, dot rises/falls with pitch.
    const gaugeX = 36;
    const gaugeY = height - 76;
    ctx.save();
    ctx.translate(gaugeX, gaugeY);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(state.roll * (Math.PI / 3));
    ctx.strokeStyle = state.openHand ? "#66f0a3" : "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
    ctx.fillStyle = "#ffd75a";
    ctx.beginPath();
    ctx.arc(0, -state.pitch * 16, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(0,0,0,0.58)";
    ctx.fillRect(0, height - 46, width, 46);
    ctx.fillStyle = "#fff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(
      `roll ${state.roll.toFixed(2)} pitch ${state.pitch.toFixed(2)} open ${state.openScore.toFixed(2)}`,
      10,
      height - 26,
    );
    ctx.fillText(status, 10, height - 10);
  };

  const update = (nowMs: number, debugVisible: boolean): void => {
    if (landmarker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
      // MediaPipe requires strictly increasing timestamps and throws
      // otherwise; never let a tracking hiccup kill the render loop.
      const detectMs = Math.max(nowMs, lastDetectMs + 1);
      lastDetectMs = detectMs;
      let raw = createEmptyHandInput(nowMs);
      try {
        const result = landmarker.detectForVideo(video, detectMs);
        latestLandmarks = (result.landmarks[0] ?? []) as HandLandmark[];
        if (latestLandmarks.length > 0) {
          raw = computeHandInputFromLandmarks(latestLandmarks, nowMs, calibration ?? NEUTRAL_CALIBRATION);
        }
      } catch {
        latestLandmarks = [];
        status = "Tracking hiccup, recovering";
      }
      lastVideoTime = video.currentTime;

      let targetRoll = 0;
      let targetPitch = 0;
      let controlling = false;

      if (raw.tracked && raw.openHand) {
        lastOpenMs = nowMs;
        controlling = true;
        if (!calibration) {
          if (calibrationStartMs === 0) calibrationStartMs = nowMs;
          rollSamples.push(raw.rollAngle);
          pitchSamples.push(raw.pitchAngle);
          if (nowMs - calibrationStartMs >= CALIBRATION_HOLD_MS) {
            calibration = {
              rollAngle: clamp(median(rollSamples), -0.5, 0.5),
              pitchAngle: clamp(median(pitchSamples), -0.7, 0.7),
            };
            status = "Calibrated - you have the controls";
          } else {
            status = "Hold your hand level to calibrate";
          }
          // Plane stays neutral while the neutral pose is being captured.
        } else {
          targetRoll = raw.roll;
          targetPitch = raw.pitch;
          status = "Hand control active";
        }
      } else {
        if (!calibration) {
          calibrationStartMs = 0;
          rollSamples = [];
          pitchSamples = [];
        }
        if (nowMs - lastOpenMs < OPEN_GRACE_MS) {
          controlling = true;
          targetRoll = smoothRoll;
          targetPitch = smoothPitch;
        } else if (raw.tracked) {
          status = "Spread your fingers to take control";
        } else if (stream) {
          status = "Show your hand to the camera";
        }
      }

      smoothRoll += (targetRoll - smoothRoll) * SMOOTHING;
      smoothPitch += (targetPitch - smoothPitch) * SMOOTHING;

      state.tracked = raw.tracked || controlling;
      state.openHand = controlling;
      state.confidence = raw.tracked ? raw.confidence : controlling ? 0.3 : 0;
      state.roll = smoothRoll;
      state.pitch = smoothPitch;
      state.rollAngle = raw.rollAngle;
      state.pitchAngle = raw.pitchAngle;
      state.openScore = raw.openScore;
      state.lastSeenMs = raw.tracked ? nowMs : state.lastSeenMs;
      state.source = state.tracked ? "mediapipe" : "none";
    }

    drawDebug(debugVisible);
  };

  const dispose = (): void => {
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    stream = null;
    landmarker?.close();
  };

  return {
    state,
    get status() {
      return status;
    },
    get calibrated() {
      return calibration !== null;
    },
    initialize,
    recalibrate: () => {
      resetCalibration();
      status = "Recalibrating - hold your hand level";
    },
    update,
    dispose,
  };
}
