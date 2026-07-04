import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { computeHandInputFromLandmarks, createEmptyHandInput } from "./handMath";
import type { HandInputState, HandLandmark } from "../types";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

export interface HandTracker {
  state: HandInputState;
  status: string;
  initialize: () => Promise<void>;
  update: (nowMs: number, debugVisible: boolean) => void;
  dispose: () => void;
}

export function createHandTracker(video: HTMLVideoElement, debugCanvas: HTMLCanvasElement): HandTracker {
  let landmarker: HandLandmarker | null = null;
  let stream: MediaStream | null = null;
  let lastVideoTime = -1;
  let latestLandmarks: HandLandmark[] = [];
  let status = "Camera idle";
  const state = createEmptyHandInput();

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
      status = "Tracking hand";
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

    ctx.fillStyle = "rgba(0,0,0,0.58)";
    ctx.fillRect(0, height - 46, width, 46);
    ctx.fillStyle = "#fff";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`roll ${state.roll.toFixed(2)} pitch ${state.pitch.toFixed(2)}`, 10, height - 26);
    ctx.fillText(`${state.openHand ? "open hand" : "spread fingers"} · ${status}`, 10, height - 10);
  };

  const update = (nowMs: number, debugVisible: boolean): void => {
    if (landmarker && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime) {
      const result = landmarker.detectForVideo(video, nowMs);
      latestLandmarks = (result.landmarks[0] ?? []) as HandLandmark[];
      Object.assign(state, latestLandmarks.length > 0 ? computeHandInputFromLandmarks(latestLandmarks, nowMs) : createEmptyHandInput(nowMs));
      lastVideoTime = video.currentTime;
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
    initialize,
    update,
    dispose,
  };
}

