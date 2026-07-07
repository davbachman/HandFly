/**
 * handControlMath.ts — reference implementation: MediaPipe hand landmarks → 3D control axes.
 *
 * Self-contained and dependency-free. Copy it, then adapt the tuning constants and the mirror
 * convention to your camera. It implements the parts that are easy to get subtly wrong:
 *   - roll from UNDIRECTED line angles + circular mean (no left/right-hand flip, no saturation)
 *   - pitch as a self-normalizing atan2 ratio (no magic neutral, distance-invariant)
 *   - open-hand from 3D ratios (survives fingers pointing at the camera)
 *   - per-user calibration, past-vertical unwrapping, deadzone/expo shaping
 *
 * It deliberately stops at [-1,1] control axes. Turning those into engine transforms — and
 * getting the signs right — is the engine's job; see references/engine-conventions.md and use
 * Rule #1 (measure the signs) from SKILL.md. Everything here is in IMAGE-LANDMARK space
 * (x right, y DOWN, z toward camera negative).
 */

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface HandControl {
  tracked: boolean;
  openHand: boolean;
  openScore: number;
  /** Shaped control in [-1,1]; positive = bank right (user's view). 0 unless openHand. */
  roll: number;
  /** Shaped control in [-1,1]; positive = climb. 0 unless openHand. */
  pitch: number;
  /** Raw calibrated-input angles in radians — keep for calibration/unwrapping/debug. */
  rollAngle: number;
  pitchAngle: number;
}

export interface Calibration {
  rollAngle: number;
  pitchAngle: number;
}

export const NEUTRAL: Calibration = { rollAngle: 0, pitchAngle: 0 };

// --- Tuning. Start here when adapting to your camera / ergonomics. ---------------------------
export const ROLL_FULL_SCALE = Math.PI * 0.31; // ~56° of bank → full deflection
export const PITCH_FULL_SCALE = Math.PI * 0.23; // ~41° of finger pitch → full deflection
const DEADZONE = 0.06;
const EXPO = 0.35;
const OPEN_THRESHOLD = 0.5;
const MAX_CONTINUOUS_ANGLE = Math.PI * 0.72; // lets bank exceed 90° when unwrapping
/**
 * Set to -1 for a raw (un-mirrored) user-facing webcam feed — the common case — so the reported
 * roll matches the direction the user perceives. Set to +1 if you mirror the landmarks upstream.
 */
const MIRROR = -1;

// --- Small math helpers (inlined so this file has no imports). --------------------------------
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist3d = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Wrap an undirected line angle into [-π/2, π/2] (a line and its 180° flip are the same). */
function normalizeLineAngle(a: number): number {
  let w = a;
  while (w > Math.PI / 2) w -= Math.PI;
  while (w < -Math.PI / 2) w += Math.PI;
  return w;
}

/** Circular (double-angle) mean of two undirected line angles; correct across the ±π/2 wrap. */
function meanLineAngle(a: number, b: number, weightA = 0.5): number {
  const wB = 1 - weightA;
  const y = weightA * Math.sin(2 * a) + wB * Math.sin(2 * b);
  const x = weightA * Math.cos(2 * a) + wB * Math.cos(2 * b);
  return Math.atan2(y, x) / 2;
}

/** Deadzone + expo shaping of a calibrated angle into [-1,1]. */
export function shapeAxis(angle: number, fullScale: number): number {
  const n = clamp(angle / fullScale, -1, 1);
  const m = Math.abs(n);
  if (m < DEADZONE) return 0;
  const s = (m - DEADZONE) / (1 - DEADZONE);
  const curved = (1 - EXPO) * s + EXPO * s ** 3;
  return Math.sign(n) * curved;
}

/**
 * Unwrap an undirected angle against the previous frame so banking past vertical keeps commanding
 * the same direction instead of flipping sign. Pass `prev = null` on (re)acquisition.
 */
export function continuousLineAngle(prev: number | null, wrapped: number): number {
  if (prev === null) return wrapped;
  let best = wrapped;
  for (const c of [wrapped - Math.PI, wrapped + Math.PI]) {
    if (Math.abs(c - prev) < Math.abs(best - prev)) best = c;
  }
  return clamp(best, -MAX_CONTINUOUS_ANGLE, MAX_CONTINUOUS_ANGLE);
}

/**
 * Compute raw control signals from one frame of 21 image-landmarks. Stateless: calibration is
 * passed in, and past-vertical unwrapping (which needs the previous frame) is layered on by the
 * caller via `continuousLineAngle` — see the loop sketch at the bottom of this file.
 */
export function computeHandControl(lm: Landmark[], calibration: Calibration = NEUTRAL): HandControl {
  if (lm.length < 21) {
    return { tracked: false, openHand: false, openScore: 0, roll: 0, pitch: 0, rollAngle: 0, pitchAngle: 0 };
  }

  const wrist = lm[0];
  const thumbTip = lm[4];
  const indexMcp = lm[5];
  const middleMcp = lm[9];
  const middleTip = lm[12];
  const ringMcp = lm[13];
  const ringTip = lm[16];
  const pinkyMcp = lm[17];
  const pinkyTip = lm[20];

  // --- Open-hand: 3D spread + reach ratios (foreshortening-invariant). ---
  const knuckleSpan = Math.max(dist3d(indexMcp, pinkyMcp), 0.03);
  const tipGaps =
    (dist3d(lm[8], middleTip) + dist3d(middleTip, ringTip) + dist3d(ringTip, pinkyTip)) / 3;
  const spread = clamp((tipGaps / knuckleSpan - 0.22) / 0.3, 0, 1);
  const fingers: Array<[Landmark, Landmark]> = [
    [indexMcp, lm[8]],
    [middleMcp, middleTip],
    [ringMcp, ringTip],
    [pinkyMcp, pinkyTip],
  ];
  const reach =
    fingers.reduce((t, [mcp, tip]) => t + dist3d(wrist, tip) / Math.max(dist3d(wrist, mcp), 0.02), 0) /
    fingers.length;
  const reachScore = clamp((reach - 0.85) / 0.35, 0, 1);
  const openScore = spread * 0.55 + reachScore * 0.45;
  const openHand = openScore >= OPEN_THRESHOLD;

  // --- Roll: blend knuckle line (rigid) with thumb→pinky line (wide), then de-mirror. ---
  const knuckleRoll = normalizeLineAngle(Math.atan2(pinkyMcp.y - indexMcp.y, pinkyMcp.x - indexMcp.x));
  const tipRoll = normalizeLineAngle(Math.atan2(pinkyTip.y - thumbTip.y, pinkyTip.x - thumbTip.x));
  const rollAngle = MIRROR * meanLineAngle(knuckleRoll, tipRoll, 0.6);

  // --- Pitch: finger elevation (on the palm-up axis) vs. toward-camera z, via atan2. ---
  const kdir = { x: pinkyMcp.x - indexMcp.x, y: pinkyMcp.y - indexMcp.y };
  const klen = Math.hypot(kdir.x, kdir.y) || 1;
  let palmUp = { x: -kdir.y / klen, y: kdir.x / klen };
  if (palmUp.y > 0) palmUp = { x: -palmUp.x, y: -palmUp.y }; // screen-up is -y
  let elevation = 0;
  let towardCamera = 0;
  for (const [mcp, tip] of [
    [middleMcp, middleTip],
    [ringMcp, ringTip],
  ] as Array<[Landmark, Landmark]>) {
    elevation += (tip.x - mcp.x) * palmUp.x + (tip.y - mcp.y) * palmUp.y;
    towardCamera += Math.max(0.015, mcp.z - tip.z);
  }
  const pitchAngle = Math.atan2(elevation / 2, towardCamera / 2);

  const roll = shapeAxis(rollAngle - calibration.rollAngle, ROLL_FULL_SCALE);
  const pitch = shapeAxis(pitchAngle - calibration.pitchAngle, PITCH_FULL_SCALE);

  return {
    tracked: true,
    openHand,
    openScore,
    roll: openHand ? roll : 0,
    pitch: openHand ? pitch : 0,
    rollAngle,
    pitchAngle,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Per-frame usage sketch (state the caller owns): calibration capture, past-vertical unwrapping,
 * smoothing, and a grace window over brief tracking dropouts.
 *
 *   let calibration: Calibration | null = null;
 *   let rollSamples: number[] = [], pitchSamples: number[] = [];
 *   let prevRollAngle: number | null = null;
 *   let smoothRoll = 0, smoothPitch = 0, lastOpenMs = -Infinity;
 *
 *   function onFrame(landmarks: Landmark[], nowMs: number) {
 *     const raw = computeHandControl(landmarks, calibration ?? NEUTRAL);
 *     let targetRoll = 0, targetPitch = 0;
 *
 *     if (raw.tracked && raw.openHand) {
 *       lastOpenMs = nowMs;
 *       const rollAngle = continuousLineAngle(prevRollAngle, raw.rollAngle); // unwrap past vertical
 *       prevRollAngle = rollAngle;
 *
 *       if (!calibration) {                     // hold level ~0.7s to capture neutral
 *         rollSamples.push(rollAngle); pitchSamples.push(raw.pitchAngle);
 *         if (rollSamples.length > 20) calibration = {
 *           rollAngle: median(rollSamples), pitchAngle: median(pitchSamples),
 *         };
 *       } else {
 *         targetRoll  = shapeAxis(rollAngle - calibration.rollAngle, ROLL_FULL_SCALE);
 *         targetPitch = raw.pitch;
 *       }
 *     } else {
 *       prevRollAngle = null;                   // reset unwrap on loss / closed hand
 *       if (nowMs - lastOpenMs < 250) {         // grace: coast through brief dropouts
 *         targetRoll = smoothRoll; targetPitch = smoothPitch;
 *       }
 *     }
 *
 *     smoothRoll  += (targetRoll  - smoothRoll)  * 0.45;   // EMA de-jitter
 *     smoothPitch += (targetPitch - smoothPitch) * 0.45;
 *     return { roll: smoothRoll, pitch: smoothPitch };     // feed your engine mapping (measure signs!)
 *   }
 *
 * And guard the detector itself — it needs strictly increasing timestamps and must not throw
 * into your render loop:
 *   const ts = Math.max(nowMs, lastTs + 1); lastTs = ts;
 *   try { result = landmarker.detectForVideo(video, ts); } catch { result = null; }
 * ---------------------------------------------------------------------------------------------- */
