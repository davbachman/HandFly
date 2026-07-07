import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { createHandControlSession } from "./handControlSession";
import {
  createHandLandmarkerOptions,
  describeHandTrackerFrame,
  VISION_WASM_URL,
} from "./handTrackerConfig";
import { computeHandInputFromLandmarks, createEmptyHandInput } from "./handMath";
import type { HandInputState, HandLandmark } from "../types";

export interface HandTracker {
  state: HandInputState;
  status: string;
  initialize: () => Promise<void>;
  update: (nowMs: number, debugVisible: boolean) => void;
  stopCamera: () => void;
  dispose: () => void;
}

async function createLandmarker(
  vision: Parameters<typeof HandLandmarker.createFromOptions>[0],
): Promise<HandLandmarker> {
  try {
    return await HandLandmarker.createFromOptions(vision, createHandLandmarkerOptions("GPU"));
  } catch (error) {
    console.warn("GPU hand tracker failed; retrying on CPU.", error);
    return HandLandmarker.createFromOptions(vision, createHandLandmarkerOptions("CPU"));
  }
}

export function createHandTracker(video: HTMLVideoElement, debugCanvas: HTMLCanvasElement): HandTracker {
  let landmarker: HandLandmarker | null = null;
  let stream: MediaStream | null = null;
  let lastVideoTime = -1;
  let lastDetectMs = 0;
  let latestLandmarks: HandLandmark[] = [];
  let status = "Camera idle";
  const controlSession = createHandControlSession();
  const state = controlSession.state;

  const initialize = async (): Promise<void> => {
    try {
      if (stream) return;
      if (!landmarker) {
        status = "Loading hand tracker";
        const vision = await FilesetResolver.forVisionTasks(VISION_WASM_URL);
        landmarker = await createLandmarker(vision);
      }

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

  const stopCamera = (): void => {
    for (const track of stream?.getTracks() ?? []) {
      track.stop();
    }
    stream = null;
    video.pause();
    video.srcObject = null;
    lastVideoTime = -1;
    latestLandmarks = [];
    status = "Camera idle";
    Object.assign(state, createEmptyHandInput(performance.now()));
    drawDebug(false);
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
    if (!stream) {
      status = "Camera idle";
      drawDebug(debugVisible);
      return;
    }

    const hasVideoFrame = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    if (landmarker && !hasVideoFrame) {
      status = describeHandTrackerFrame({
        hasVideoFrame,
        detectionHiccup: false,
        landmarkCount: latestLandmarks.length,
      }) ?? status;
    }

    if (landmarker && hasVideoFrame && video.currentTime !== lastVideoTime) {
      // MediaPipe requires strictly increasing timestamps and throws
      // otherwise; never let a tracking hiccup kill the render loop.
      const detectMs = Math.max(nowMs, lastDetectMs + 1);
      lastDetectMs = detectMs;
      let raw = createEmptyHandInput(nowMs);
      let detectionHiccup = false;
      try {
        const result = landmarker.detectForVideo(video, detectMs);
        latestLandmarks = (result.landmarks[0] ?? []) as HandLandmark[];
        if (latestLandmarks.length > 0) {
          raw = computeHandInputFromLandmarks(latestLandmarks, nowMs);
        }
      } catch {
        latestLandmarks = [];
        detectionHiccup = true;
      }
      lastVideoTime = video.currentTime;

      controlSession.update(raw, nowMs);
      status =
        describeHandTrackerFrame({
          hasVideoFrame,
          detectionHiccup,
          landmarkCount: latestLandmarks.length,
        }) ?? controlSession.status;
    }

    drawDebug(debugVisible);
  };

  const dispose = (): void => {
    stopCamera();
    landmarker?.close();
    landmarker = null;
  };

  return {
    state,
    get status() {
      return status;
    },
    initialize,
    update,
    stopCamera,
    dispose,
  };
}
