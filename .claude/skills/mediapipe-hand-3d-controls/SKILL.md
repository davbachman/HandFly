---
name: mediapipe-hand-3d-controls
description: >-
  Map MediaPipe hand-landmark coordinates onto the controls of a 3D model or scene shown on
  screen — turning hand roll/pitch/yaw and gestures into model rotations, position, or camera
  moves. Use this whenever hand tracking drives anything in a 3D engine (Babylon.js, Three.js,
  Unity, raw WebGL/WebGPU) and the mapping misbehaves: axes inverted or mirrored, roll that
  flips sign or snaps to full deflection, controls that drift or jitter, an open hand or gesture
  that goes undetected when the fingers point at the camera, or confusion about image-space vs
  world-landmark vs engine coordinates. Reach for it proactively any time you are wiring
  MediaPipe Hands (or a similar landmark tracker) to a 3D view, or debugging why the on-screen
  object will not move the way the hand does — even when the user only says "the hand controls
  are backwards", "my gesture control feels wrong", or "the plane/cursor/model won't respond".
---

# MediaPipe hands → 3D model controls

Mapping a tracked hand onto an on-screen 3D object looks trivial and almost never is. The
failures are boringly consistent: the control is mirrored, or it works for a left hand but not a
right, or a level hand reads as full tilt, or it flips sign the moment the hand passes vertical,
or the model rotates the opposite way from the hand. Every one of these is a coordinate-system
mismatch between three different spaces that all use x/y/z but disagree on what those mean.

This skill gives you the mental model, a method to nail the signs without guessing, a catalog of
the specific failures and their fixes, and a dependency-free reference implementation you can
adapt.

## The three coordinate spaces you are juggling

Almost every bug here is a silent conversion error between these. Name them explicitly in your
code and comments — the confusion comes from calling all three "x/y/z".

1. **Image-landmark space** — `results.landmarks` (a.k.a. normalized landmarks). `x` and `y` in
   `[0,1]` across the frame, **`y` grows DOWNWARD**, `z` is a rough depth relative to the wrist
   (more negative ≈ closer to camera), low quality. This is a 2D-accurate, screen-aligned space.
   Best for angles the user perceives *in the plane of the screen* (roll/bank, finger elevation).

2. **World-landmark space** — `results.worldLandmarks`. Metric meters, origin near the hand's
   geometric center, roughly right-handed, **independent of the image**. Better for true 3D
   orientation, but noisier and with orientation/handedness quirks. Use it when you need real 3D
   pose, not when you need "what the user sees".

3. **Engine / world space** — Babylon, Three.js, Unity, or your own. Has its **own handedness**
   (Babylon left-handed, Three.js right-handed, Unity left-handed) and a camera pointing some
   direction. "Screen-right" here is not a fixed axis; it depends on where the camera looks.

The camera feed adds a fourth trap on top: **a user-facing webcam is usually NOT mirrored in the
raw landmarks.** You see yourself un-flipped, so a motion the user calls "clockwise" appears
*counter*-clockwise in image-landmark space. If you (or CSS `transform: scaleX(-1)`) mirror the
*preview* but not the *math*, the numbers and the picture disagree. Decide once whether you are
working in mirrored or raw coordinates and convert everything to that convention at the source.

## Workflow

1. **Extract raw pose signals** from landmarks — roll, pitch, yaw, openness — in image-landmark
   space, as **angles in radians**, not pre-scaled `[-1,1]` values. Keep the raw angle around;
   you need it for calibration and unwrapping. See `references/landmark-geometry.md`.
2. **Resolve the mirror/handedness convention** so the signals mean the same thing for either
   hand and match what the user sees. This is usually a single negation, applied at the source.
3. **Calibrate a neutral pose.** Capture the user's actual "level" hand (median of ~0.5–0.7 s of
   samples) and subtract it as an offset. Do not hardcode a neutral — camera height, wrist
   posture, and seating differ per person, and a wrong constant gives everyone a constant drift.
4. **Shape** each axis: deadzone near neutral, expo curve, clamp to `[-1,1]`. Smooth across
   frames (EMA) to kill landmark jitter, and add a short grace window so one dropped frame does
   not snap the control to zero.
5. **Map to the engine** — and here you *measure* the signs, you do not derive them (next
   section). See `references/engine-conventions.md`.

The reference implementation in `scripts/handControlMath.ts` does steps 1–4 end to end. Read it
before writing your own; it encodes the non-obvious parts (undirected angles, self-normalizing
pitch, foreshortening-proof openness) that are easy to get subtly wrong.

## Rule #1: measure signs, don't derive them

The single biggest time sink is trying to reason out the correct sign by composing all the
conventions in your head — image y-down, times mirrored-or-not, times engine handedness, times
camera facing, times "which way is positive roll for my model". People get it wrong, flip one
sign, break two others, and chase their tail.

Don't. **Isolate one axis and read the number.** The trick is to separate the two halves of the
pipeline with a printed intermediate value, because "the hand math is wrong" and "the engine
mapping is wrong" have the *same* visible symptom (model goes the wrong way) and opposite fixes.

1. Put a live readout on screen (or in the console) of BOTH the computed control value (e.g.
   `roll`) and the resulting model transform.
2. **Neutral first.** Hold the calibrated neutral pose. The value must read ≈ 0. If it doesn't,
   stop — fix calibration before touching any signs, or every later judgment is polluted.
3. **Check the hand half.** Make one deliberate "bank right" motion. Read the *sign of the
   value*. If you want "bank right" to be positive and it's negative, negate once **at the
   pose→value step** (the source), not downstream.
4. **Check the engine half.** Now watch the model. Value correct but model banks the wrong way?
   The error is in value→engine (rotation-axis sign or camera facing), fix it *there*. Value and
   model now agree? Done — move to the next axis and repeat.

This "is the hand value right?" vs "is the engine mapping right?" split turns an N-way guessing
game into two one-bit decisions per axis. Do roll, then pitch, then yaw, one at a time.

## Failure catalog

Match the symptom, apply the fix. Details and code in the reference files.

- **A level hand reads as full tilt / roll saturates at ±1.** You used `atan2(dy, dx)` on a
  *directed* vector (e.g. thumb→pinky). That vector points opposite ways for the two hands and
  sits near ±π for a level hand, so tiny wobbles flip the whole range. Fix: treat orientation as
  an **undirected line** (period π), wrap the angle to `[-π/2, π/2]`. See `landmark-geometry.md`
  → "Roll".

- **Roll flips sign the instant the hand passes vertical.** Consequence of the period-π wrap:
  past ~90° the wrapped angle jumps to the far end. Fix: **unwrap against the previous frame** —
  pick the ±π candidate nearest last frame's angle, capped so it can't wind up forever
  (`continuousLineAngle` in the script).

- **Works for one hand, inverted for the other.** You're keying off a directed thumb-side vector,
  or off `results.handedness` that you trust too much. Use undirected line angles (handedness-
  free) and resolve mirror at the source so both hands produce the same sign.

- **Everything is mirrored left/right.** The feed is un-mirrored but your preview or your
  intuition is mirrored. Negate the horizontal component (or the roll) once at the source. Pick
  mirrored-or-raw as your convention and apply it everywhere. See "the fourth trap" above.

- **Model rotates opposite to the hand, but the printed value looks right.** Engine half. Wrong
  rotation-axis sign for your handedness, or wrong assumption about which world axis is
  screen-right for your camera. See `engine-conventions.md` → "Which way is screen-right".

- **Open hand / gesture not detected when fingers point at the camera.** You measured openness
  with 2D screen distances, which collapse under foreshortening — exactly the pose many controls
  ask for ("point your palm/fingers at the screen"). Fix: use **3D ratios** — adjacent fingertip
  gaps vs. the rigid knuckle span (spread), and wrist→tip vs. wrist→knuckle length (reach). These
  are scale- and foreshortening-invariant. See `landmark-geometry.md` → "Open-hand detection".

- **Pitch drifts, or needs a magic neutral constant, or changes with hand distance.** You
  measured a raw pixel offset. Fix: compute pitch as `atan2(elevation, towardCamera)` where
  elevation is the finger direction projected on the palm-up axis — a **ratio of two measured
  quantities**, so it self-normalizes across hand size and distance and needs no hardcoded
  neutral. See `landmark-geometry.md` → "Pitch".

- **Control is twitchy / noisy.** Landmarks jitter frame to frame. Add EMA smoothing on the
  shaped output and a deadzone near neutral. Don't over-smooth — it adds latency that feels like
  lag.

- **Control snaps to neutral on brief tracking dropouts.** A single frame with no hand zeroed
  everything. Add a short grace window (~250 ms): keep commanding the last value through brief
  gaps, only release after the gap exceeds the window.

- **`detectForVideo` throws / freezes the loop.** It requires strictly increasing timestamps.
  Feed `max(nowMs, lastTs + 1)` and wrap the call in try/catch so a tracking hiccup can't kill
  your render loop.

## Reference files

- `references/landmark-geometry.md` — the 21-landmark map and the exact geometry for roll
  (undirected lines + circular mean), pitch (self-normalizing atan2), yaw, open-hand detection,
  calibration, unwrapping, and axis shaping. Read this when deriving or debugging the pose math.
- `references/engine-conventions.md` — handedness per engine, the rule for "which world axis is
  screen-right" given your camera, image-landmarks vs world-landmarks tradeoffs, and a worked
  Babylon.js example with its signs shown as *results of measurement*, not laws.
- `scripts/handControlMath.ts` — a self-contained, dependency-free reference implementation of
  the whole pose→control pipeline. Adapt it; don't reinvent the fiddly bits.
