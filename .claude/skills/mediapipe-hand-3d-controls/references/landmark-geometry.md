# Landmark geometry

The exact pose math, with the reasoning behind the non-obvious choices. Indices are MediaPipe
Hand Landmarker's 21-point model. All of this operates in **image-landmark space** (`x` right,
`y` DOWN, `z` toward camera negative) unless stated otherwise.

## Contents

- [The 21 landmarks](#the-21-landmarks)
- [Roll (bank / tilt)](#roll-bank--tilt)
- [Pitch (climb / dive)](#pitch-climb--dive)
- [Yaw (heading)](#yaw-heading)
- [Open-hand detection](#open-hand-detection)
- [Calibration](#calibration)
- [Unwrapping past vertical](#unwrapping-past-vertical)
- [Axis shaping](#axis-shaping)

## The 21 landmarks

```
0  wrist
1  thumb_cmc   2  thumb_mcp   3  thumb_ip    4  thumb_tip
5  index_mcp   6  index_pip   7  index_dip   8  index_tip
9  middle_mcp 10  middle_pip 11  middle_dip 12  middle_tip
13 ring_mcp   14  ring_pip   15  ring_dip   16  ring_tip
17 pinky_mcp  18  pinky_pip  19  pinky_dip  20  pinky_tip
```

`_mcp` = knuckle (base of finger), `_tip` = fingertip. The **knuckle line** 5→17
(index_mcp → pinky_mcp) is the most rigid, reliable orientation reference on the hand — it barely
deforms as fingers move, so lean on it for roll and as the axis for pitch.

## Roll (bank / tilt)

The intent: rotating the hand about the axis pointing at the screen (like tilting a steering
wheel) should roll the model.

**Why the naive approach fails.** The obvious move is `atan2(pinky.y - thumb.y, pinky.x - thumb.x)`.
Two problems: (1) the thumb→pinky vector points in *opposite* directions for a left vs. right
hand, so the same physical tilt yields opposite signs; (2) for a level hand that vector lies near
horizontal, i.e. near ±π in `atan2`, which is exactly where the sign is unstable — tiny jitter
swings the reading across the whole range and the model reads full-bank-either-way at rest.

**The fix: treat orientation as an undirected line.** A tilt and its 180°-flip are the same bank,
so work modulo π. Wrap any raw angle into `[-π/2, π/2]`:

```
normalizeLineAngle(a):
  while a >  π/2: a -= π
  while a < -π/2: a += π
  return a
```

Compute two line angles and blend them, because each alone is imperfect: the **knuckle line**
(5→17) is rigid but short; the **thumb→pinky line** (4→20) is wider (more angular resolution) but
moves with the thumb.

```
knuckleRoll = normalizeLineAngle(atan2(p17.y - p5.y,  p17.x - p5.x))
tipRoll     = normalizeLineAngle(atan2(p20.y - p4.y,  p20.x - p4.x))
```

**Blend with a circular mean, not an arithmetic one.** Averaging angles that straddle the ±π/2
wrap (e.g. +85° and −85°, which are 10° apart, not 170°) numerically is wrong. Use the
double-angle trick: map each line angle θ to a unit vector at 2θ, average the vectors, halve the
result. This averages correctly across the wrap.

```
meanLineAngle(a, b, wA):        # wA = weight on a, in [0,1]
  wB = 1 - wA
  y = wA*sin(2a) + wB*sin(2b)
  x = wA*cos(2a) + wB*cos(2b)
  return atan2(y, x) / 2

rollAngle = meanLineAngle(knuckleRoll, tipRoll, 0.6)   # favor the rigid knuckle line
```

**Then resolve the mirror.** With a raw (un-mirrored) webcam feed, the image tilts the opposite
way from what the user perceives, so negate to convert to the user's view:

```
rollAngle = -rollAngle          # only if your feed/preview is un-mirrored; see SKILL.md trap #4
```

Keep `rollAngle` as radians. Calibrate and shape it later. Prefer this image-plane roll over a
world-landmark roll for screen-relative control: it matches what the user sees on the glass.

## Pitch (climb / dive)

The intent: rotating the fingers up/down about the knuckle line (nose up / nose down) should pitch
the model.

**Measure a ratio, not an offset.** A raw "how many pixels are the tips above the knuckles" reading
depends on hand size, distance to camera, and needs a hand-tuned neutral constant that's wrong for
everyone else. Instead measure the finger direction as an **angle**: how far it points *up*
(perpendicular to the knuckle line, in the image plane) versus *toward the camera* (the `z`
component). `atan2` of those two self-normalizes — scale cancels.

Use the middle and ring fingers (least affected by spread) and the knuckle line as the "up"
reference so pitch stays correct even while the hand is banked:

```
# palm-up = perpendicular to the knuckle line (5→17), normalized, flipped to point screen-up.
# screen-up is NEGATIVE y (y grows down), so force palmUp.y < 0.
kdir  = (p17.x - p5.x, p17.y - p5.y)
klen  = hypot(kdir) or 1
palmUp = (-kdir.y/klen, kdir.x/klen)
if palmUp.y > 0: palmUp = (-palmUp.x, -palmUp.y)

elevation = 0; towardCamera = 0
for (mcp, tip) in [(9,12), (13,16)]:            # middle, ring
  elevation    += (tip.x-mcp.x)*palmUp.x + (tip.y-mcp.y)*palmUp.y
  towardCamera += max(0.015, mcp.z - tip.z)     # tips point at camera → smaller z; clamp ≥ eps

pitchAngle = atan2(elevation/2, towardCamera/2)
```

Positive `pitchAngle` = fingers tilted up = climb. The `z` term is the one place you rely on
image-landmark depth; it's coarse but only needs to be roughly right because it's inside an
`atan2` ratio, and the clamp keeps it from blowing up when fingers point straight at the lens.

## Yaw (heading)

Yaw (turning the hand left/right about the vertical axis) is the **least reliable** signal from a
single monocular camera — it's mostly encoded in the low-quality `z` depth. Options, in order of
preference:

- **Don't map it from the hand.** Many good hand-flight/steering schemes derive yaw from roll (a
  banked turn) instead of reading it directly. This is what feels natural for aircraft and is far
  steadier.
- If you need explicit yaw, take it from **world-landmarks**: the horizontal component of the
  knuckle line's normal, or the palm normal (cross product of two palm vectors). Expect noise;
  smooth heavily.
- Avoid deriving yaw from image-landmark `z` deltas alone; it will jitter.

## Open-hand detection

The intent: know when the hand is a flat open palm (controls engaged) vs. a fist (released), and
have it survive the fingers pointing at the camera.

**2D distances fail here** — when fingers foreshorten toward the lens, screen-space fingertip
distances collapse and an open hand reads as closed. Use **3D ratios** (from image landmarks with
`z`, or better from world-landmarks), which are invariant to scale and foreshortening:

```
knuckleSpan = dist3d(p5, p17)                        # rigid reference length
tipGaps     = mean(dist3d(p8,p12), dist3d(p12,p16), dist3d(p16,p20))   # adjacent fingertip gaps
spread      = clamp((tipGaps/knuckleSpan - 0.22) / 0.30, 0, 1)

reach = mean over fingers of  dist3d(wrist, tip) / dist3d(wrist, mcp)  # ~>1 extended, <1 curled
reachScore = clamp((reach - 0.85) / 0.35, 0, 1)

openScore = 0.55*spread + 0.45*reachScore
openHand  = openScore >= 0.5
```

Tune the constants to your camera and hand, but keep the *structure*: gaps normalized by knuckle
span, tip reach normalized by knuckle reach. Both numerator and denominator scale together, so the
ratio holds as the hand moves nearer/farther or rotates.

## Calibration

Never assume the user's neutral. Capture it: while the hand is open and roughly still, collect
~0.5–0.7 s of `rollAngle` and `pitchAngle` samples, take the **median** (robust to a few bad
frames), clamp to a sane range, and store as an offset subtracted from every later reading.

```
calibration = { roll: clamp(median(rollSamples), -0.5, 0.5),
                pitch: clamp(median(pitchSamples), -0.7, 0.7) }
control = shape(rollAngle - calibration.roll, ...)
```

Offer a re-calibrate key — posture drifts over a session. A wrong or missing neutral is the usual
cause of "it always pulls to one side".

## Unwrapping past vertical

Because roll lives modulo π, banking past ~90° makes the wrapped angle jump to the opposite end,
flipping the control mid-maneuver. Unwrap against the previous frame: of the candidates
`{θ, θ−π, θ+π}`, choose the one nearest last frame's value, and cap the running value so a
misread can't spin it up without bound.

```
continuousLineAngle(prev, wrapped):
  if prev is null: return wrapped
  best = wrapped
  for c in [wrapped - π, wrapped + π]:
    if abs(c - prev) < abs(best - prev): best = c
  return clamp(best, -MAX, +MAX)          # MAX ≈ 0.72π lets you exceed 90° without winding up
```

Reset `prev` to null whenever tracking is lost or the hand closes, so the next acquisition starts
clean instead of unwrapping against a stale angle.

## Axis shaping

Turn a calibrated angle into a `[-1,1]` control that feels good: a deadzone kills drift at
neutral, an expo curve gives fine control near center while still reaching the extremes, and a
full-scale angle sets how far you must tilt for full deflection.

```
shapeAxis(angle, fullScale):
  n = clamp(angle / fullScale, -1, 1)
  m = abs(n)
  if m < DEADZONE: return 0                          # e.g. 0.06
  s = (m - DEADZONE) / (1 - DEADZONE)
  curved = (1 - EXPO)*s + EXPO*s^3                    # e.g. EXPO 0.35
  return sign(n) * curved
```

Then EMA-smooth the shaped output across frames (`out += (target - out) * α`, α ≈ 0.4 at ~30 Hz)
and keep commanding the last value through brief tracking gaps. Choose `fullScale` so a
comfortable wrist tilt (≈ 50–60° for roll, ≈ 40° for pitch) reaches ±1 — too large and the model
feels unresponsive, too small and it's twitchy.
