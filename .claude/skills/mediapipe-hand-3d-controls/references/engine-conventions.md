# Engine conventions

How the pose signals (`roll`, `pitch`, `yaw` in `[-1,1]`, plus openness/gestures) become
transforms on an on-screen object. This is the half people get wrong *after* the hand math is
already correct, because it involves the engine's handedness and the camera's facing — neither of
which is visible in the pose numbers.

## Contents

- [Image landmarks vs world landmarks](#image-landmarks-vs-world-landmarks)
- [Handedness by engine](#handedness-by-engine)
- [Which way is screen-right](#which-way-is-screen-right)
- [Applying roll / pitch / yaw](#applying-roll--pitch--yaw)
- [Worked example: Babylon.js chase camera](#worked-example-babylonjs-chase-camera)

## Image landmarks vs world landmarks

Pick the source per signal based on what the control means:

| Need | Use | Why |
| --- | --- | --- |
| Screen-relative bank/pitch (what the user sees on the glass) | **image landmarks** | 2D-accurate, aligned to the screen plane; `x`,`y` are trustworthy |
| True 3D hand orientation (palm normal, absolute pose) | **world landmarks** | metric 3D; not distorted by perspective |
| Openness / gestures | either, but use **3D distances** | must survive foreshortening (see landmark-geometry.md) |

For a model the user is "flying" or "steering" by feel, image-plane angles usually win — they
match the mirror-image the user is reacting to. World-landmarks are the right tool when you're
reconstructing the hand's actual orientation in space (e.g. driving a 3D hand model), and they
carry their own origin/handedness quirks, so smooth and sanity-check them.

## Handedness by engine

Handedness decides the sign of a rotation about a given axis and which cross-product direction is
"right". Know your engine's default:

- **Babylon.js** — left-handed by default (`scene.useRightHandedSystem = false`). Positive
  rotation about `+Z` and the screen-right axis behave differently than in a right-handed engine.
- **Three.js** — right-handed. Camera looks down `−Z` by default; `+X` is world-right, `+Y` up.
- **Unity** — left-handed. `+X` right, `+Y` up, `+Z` forward (into the screen).
- **Raw WebGL / WebGPU** — you chose it (usually right-handed NDC, but your view matrix decides).

Don't memorize what each sign "should" be — memorize that handedness flips one sign per axis, and
then **measure** (SKILL.md → Rule #1) instead of composing it in your head.

## Which way is screen-right

There is no fixed "screen-right" world axis; it depends on where the camera looks. The reliable
rule:

> **Screen-right is the camera's local +X (its right vector).** Work out what that is in world
> space for your specific camera, or just read it from the camera (`camera.getDirection`, the
> view matrix's basis vectors, `camera.right`, etc.).

The classic trap is a **chase/cockpit camera looking down world −Z**. People assume "right = world
+X" out of habit, but for a camera facing −Z the screen-right world axis can be **−X** depending
on handedness and up-vector. If your model's lateral motion goes the wrong way while the roll
*value* is correct, this is almost always the culprit. Rather than reason it out: bank the model,
watch which way it slides on screen, and flip the lateral sign if it's wrong. One measurement
beats an hour of matrix algebra.

## Applying roll / pitch / yaw

Typical arcade mapping (adapt signs by measurement):

```
// attitude: ease toward the commanded angle so control feels weighty, not instant
targetRoll  = command.roll  * MAX_BANK      // e.g. π/3
targetPitch = command.pitch * MAX_PITCH     // e.g. π/5.5
model.roll  = damp(model.roll,  targetRoll,  k, dt)
model.pitch = damp(model.pitch, targetPitch, k, dt)

// coordinated-turn yaw: lean the nose into the bank and let it return,
// instead of integrating heading forever (which flies the model sideways)
model.yaw = damp(model.yaw, model.roll * YAW_LEAN, k2, dt)

// motion: convert bank into lateral velocity. SIGN of the lateral term is the
// screen-right question above — measure it, don't assume.
velocity.x = LATERAL_SIGN * sin(model.roll) * speed * kx
velocity.y = sin(model.pitch) * speed * ky
```

Two things that bite:

- **Don't integrate yaw indefinitely** from roll. `yaw += roll*dt` accumulates and the model ends
  up flying sideways/backward. Damp yaw toward a bounded lean (`roll * const`) so it recenters.
- **Ease, don't snap.** Driving the transform straight from the raw command makes jitter visible
  and the control feel nervous. A critically-damped approach (`damp`) adds a little weight and
  hides single-frame noise without the latency of heavy smoothing.

## Worked example: Babylon.js chase camera

From a real, debugged setup (a hand-flown plane, chase camera behind it looking down −Z in
Babylon's **left-handed** world). **These signs are the *result of measuring* with Rule #1, not
laws — your camera or handedness will differ.**

```ts
// Camera sits behind (+z) and above the plane, looking forward down -z.
camera.position.set(planeX, planeY + 4.8, planeZ + 34);
camera.setTarget(new Vector3(planeX, planeY + 0.35, planeZ - 82));

// Positive roll = "bank right" as the user sees it. With this camera, that is a
// POSITIVE rotation about z, and screen-right turned out to be -x:
planeRoot.rotation.set(plane.pitch, plane.yaw, plane.roll);   // measured: +roll here
plane.velocity.x = -Math.sin(plane.roll) * plane.speed * 0.72; // measured: screen-right is -x
plane.velocity.y =  Math.sin(plane.pitch) * plane.speed * 0.62;
plane.velocity.z = -plane.speed;                               // forward is -z
```

How those two signs (`+roll` on `rotation.z`, `−x` for screen-right) were pinned down: print
`plane.roll`, hold neutral (reads 0 ✓), bank the hand right (value goes positive — good, that's
the desired convention). Then watch the model: it must visually bank right *and* drift right. When
one of them was backwards, only that one sign was flipped, the value was left alone, and it was
re-measured. Ten seconds per axis, no algebra, no cascading sign errors.

The lesson generalizes: get the hand value's sign right *once* against the user's intent, then fix
each engine sign independently by watching the screen. Keep the two halves separate and every bug
has exactly one place to live.
