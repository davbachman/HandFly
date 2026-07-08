Original prompt: Create a new web game that uses mediapipe to let the user fly a plane with hand motions. The user should see a plane from the rear in the center of the screen, moving at constant speed. The user controls the plane by holding their hand in front of the camera, with fingers spread apart. Level hand with ring finger pointing toward the screen is the neutral position. Tilting the hand clockwise or counterclockwise (detectable from rotations of thumb and pinky in camera plane), the plane similarly tilts. Rotations of the ring finger around axis determined by thumb and pinky determine plane pitch. The challenge is to fly the plane around and through obstacles. Fly through tunnels, over mountains, under/over bridges, etc. Later I will add things you have to shoot by using the space bar. Make the game as realistic and playable as possible.

Implementation notes:
- Initialized git repository on `main`.
- Added test-first core logic for hand geometry, flight, course, collision, simulation, and text state.
- Built the Babylon.js/Vite/TypeScript browser game with a local glTF plane asset, procedural terrain, gates, tunnels, bridges, mountains, HUD, debug overlay, keyboard fallback, fullscreen, and MediaPipe Hand Landmarker setup.
- Verified unit tests, production build, production dependency audit, required web-game Playwright client, full-page desktop/mobile screenshots, crash/restart, and reserved space-bar fire state.
- Fixed hand-roll control by using directed thumb/pinky and knuckle-axis roll signals, passing MediaPipe world landmarks into the roll math, and allowing open-hand input through brief confidence dips.
- Fixed roll quantization/right-roll loss by normalizing roll angles over a 90-degree bank range and preferring camera-plane roll over world-landmark roll when both are available.

Control overhaul (July 2026):
- Rewrote hand geometry: roll now uses undirected line angles (doubled-angle mean of thumb-pinky tips + knuckle line) so a level right hand no longer saturates at full bank, with the sign mirrored to match the player's view. Pitch uses middle+ring finger elevation vs. the camera axis projected on the palm-up direction - self-normalizing, no magic neutral constant.
- Open-hand detection switched to 3D spread/reach ratios so the instructed pose (fingers pointing at the screen, foreshortened) is accepted; fist releases control.
- Added auto-calibration (hold open hand ~0.7s captures neutral; `C` recalibrates), 280ms grace through tracking dips, and EMA smoothing instead of snap-to-zero.
- Fixed inverted axes end-to-end: the chase camera looks down -z, so screen-right is -x; positive roll = bank right visually (rotation.z = +roll) and moves -x. Yaw is now a bounded coordinated-turn lean instead of integrating forever.
- Keyboard axes override the hand while held; Space/Shift merge into hand flight (fire/boost) instead of stealing the stick.
- Gates/tunnels only kill on their frame/wall now - flying around them is legal but scores 25 vs 100 for threading; bridges/mountains score 50.
- Course generation caps gate/tunnel jumps to reachable offsets (x within 20, y within 12 of the previous opening) and pushes mountain peaks clear of the corridor line; difficulty ramps over 2600m (tighter openings, closer spacing, taller peaks).
- Visual fixes: terrain tiles now stay under the plane (round-snap + symmetric tile layout), tunnels are real open tubes with rim rings, gates got ground posts, added recycled clouds, camera lag/lean, and a proper procedural plane (the glTF had zero-thickness wings and was dwarfed by a leftover silhouette hack; @babylonjs/loaders dropped).
- Boost (Shift, 1.4x), HUD distance/altitude, artificial-horizon widget in the debug overlay, `window.setRealtime(false)` test hook for deterministic scripted runs.
- Verified with vitest (29 tests) plus a Playwright autopilot that reads render_game_to_text and threads the course deterministically (19/19 checks, ~1800m+ per run).

Obstacle visual overhaul (July 2026):
- Gates: air-race pylon frames with white corner blocks and mid-band uprights, steel ground legs.
- Tunnels: faceted orange shell with a separate dark interior bore, amber mouth rims, exterior ribs.
- Bridges: rebuilt as suspension bridges - tall capped towers, catenary main cables (tubes) with vertical hangers, side spans to ground anchor blocks, asphalt roadway with center line. Towers are now SOLID in the collision model (constants shared between collision.ts and scene.ts), fixing the previously intangible piers; fly over/under the deck between the towers.
- Mountains: flat-shaded rock with deterministic per-peak twist/footprint variation, mossy foothill skirts, snow caps on peaks taller than 26.
- Added a bobbing yellow chevron above the next gate/tunnel opening as a navigation cue.

Playability adjustments (July 2026):
- Warm-up stretch: first obstacle moved to z=-420 (~6s of open air at cruise) so the player can raise and calibrate their hand after takeoff; applies to every restart.
- Hull damage instead of instant death: three hits down the plane (HIT_DAMAGE 0.34 in simulation.ts) with a 1.5s invulnerability window between hits; the plane blinks through the window and the chase camera shakes on every hit (bigger on the fatal one). HUD gained a color-coded hull meter.
- Final hit triggers a mesh-based explosion (flash sphere + fire/smoke debris under gravity) with the plane hidden; the crash menu waits ~1.1s so the explosion is visible.
- Ground contact is a damaging hit: altitude floor lowered to 2.6, scraping it costs a hull segment and bounces the plane up nose-high; a fatal ground hit explodes like any other.
- Shadow made sun-realistic: plane-shaped (wing + fuselage ellipses), displaced along the directional light's slant as altitude grows, rotating with heading, softer and fainter higher up.
- Tests: simulation suite covers damage/grace-window/third-hit-fatal/ground-bounce; course tests assert the warm-up gap; Playwright checks hull drain to zero across ground scrapes (20/20).

Control-loss fixes (July 2026), after a report that the plane becomes uncontrollable once it veers off course:
- Stuck-key latch: if focus left the window while a key was held, the lost keyup left that axis pinned at +-1, silently overriding hand input forever (held keys beat the hand by design). keyboard.ts now releases all keys on window blur and tab hide; covered by keyboard.test.ts.
- Roll reversal past vertical: undirected line angles wrap at +-90 degrees, so banking the hand past vertical during a big correction flipped the roll sign and fought the player. continuousLineAngle() in handMath.ts unwraps the angle frame-to-frame (capped at ~130 degrees) and the tracker shapes roll from the unwrapped angle.
- Silent tracking loss: flying for >0.5s with no control source now raises a pulsing red banner ("Control lost - show your open hand" / keyboard hint when the camera is unavailable). Includes a fix for stale elapsed-time comparisons across restarts.

Shooting, sound, and high scores (July 2026):
- Space now fires tracer projectiles (projectiles.ts: 190ms cooldown, inherits lateral motion, 1.5s lifetime). Balloons float through the course as targets: gold pop for 150 points, green repair one hull segment (+50); ramming a balloon collects it too. Six balloons recycle ahead of the plane; the first floats in the warm-up stretch as a teaching target.
- Transient GameEvents (shot/pop/repair/hit/explosion/pass-threaded/pass-bypassed) flow from the simulation to the renderer and audio, drained by the main loop each frame.
- Procedural audio (audio.ts): engine drone follows speed, plus synthesized one-shots for every event - all Web Audio oscillators/noise, zero assets, unlocked on the Start click, M to mute.
- Balloon visuals with strings and bob, tracer pool, and color-coded pop flashes in scene.ts.
- Best score/distance persist in localStorage and show on the crash screen.
- 44 unit tests across 7 suites; Playwright verification is 24/24 including shooting a balloon and healing off a repair balloon.

Difficulty/options/reacquisition adjustments (July 2026):
- Raised base obstacle spacing from 68 to 82 and softened the late-course spacing squeeze, so the minimum generated gap is now 80+ early and remains less punishing deeper into the run.
- Moved balloons/projectiles behind mode-specific starts during this iteration; later Obstacle Course made sparse repair balloons standard and Shooting Gallery kept scoring balloons.
- Extracted hand reacquisition state into `handControlSession.ts`. The session now snaps to the current control target when an open hand is reacquired, while preserving roll unwrap continuity through short no-hand tracking gaps and resetting it after longer losses.
- Verification: unit tests are now 49 across 8 suites; production build passes. Browser checks with the web-game Playwright client confirmed default mode has `targetsEnabled:false`/no balloons and target mode can fire/pop a warm-up balloon.

Prompted calibration adjustment (July 2026):
- Initial hand calibration is now explicit: after an open hand is seen, the game prompts the player to hold a level hand with fingers spread and middle finger pointing at the screen, waits 3 seconds, then captures the current hand pose as neutral.
- Added a visible calibration prompt overlay during flight while calibration is pending; the small HUD status still mirrors the same tracker status.
- `handControlSession.test.ts` covers the 3-second wait, reset-on-loss before calibration, and "use the current pose at timeout" behavior.

Pitch calibration fix (July 2026):
- Root cause of post-calibration nose dive / upward saturation: the prompted calibration captured the current hand pose, but then clipped the stored neutral roll/pitch angles to fixed ranges. If MediaPipe reported the user's actual neutral outside those ranges, a steady hand immediately produced a false pitch/roll command.
- Fixed `handControlSession.ts` to store the exact captured neutral pose without clipping. Shaping/clamping still happens only on the delta between live pose and neutral.
- Added a regression test for large captured neutral angles staying zero when the hand remains steady.
- Verification: `npm test` is 53/53, `npm run build` passes, and web-game Playwright smoke check rendered cleanly with no console error artifacts.

Hand tracking robustness adjustment (July 2026):
- Lighting can make MediaPipe return zero hand landmarks even with a hand physically in frame. The tracker now uses more tolerant hand detection/presence/tracking confidence thresholds for reacquisition while leaving the game's own open-hand filter in place.
- Added a typed GPU-to-CPU landmarker fallback so a WebGL/GPU tracker initialization failure does not make camera control unavailable when CPU tracking can still run.
- Split tracker status for "camera has video frames but MediaPipe has no landmarks" from true camera/no-hand loss; after calibration it now says "Hand lost - open palm in camera view" instead of the misleading "Show your hand to the camera".
- Verification: `npm test` is 57/57, `npm run build` passes, and the web-game Playwright smoke check rendered cleanly with no captured error artifacts.

Post-calibration steering fix (July 2026):
- Root cause: after calibration, hand steering still required every frame to pass the strict `openHand` threshold. If landmark quality, lighting, or tilt pushed the open score just below that cutoff, the session held zero briefly and then dropped control, making the plane feel unresponsive right after the countdown.
- Added post-calibration open-hand hysteresis in `handControlSession.ts`: a clearly open hand is still required to begin calibration/control, but once calibrated, marginal tracked open-hand scores can keep steering active. A clearly closed hand still releases control after the grace window.
- Verification: `handControlSession.test.ts` is 8/8, full `npm test` is 59/59, `npm run build` passes, and the web-game Playwright smoke check rendered cleanly with no captured error artifacts.

Fixed-neutral control adjustment (July 2026):
- Removed the calibration countdown and `C` recalibrate path. Hand control now uses fixed neutral angles (`rollAngle = 0`, `pitchAngle = 0`) and starts steering immediately when an open tracked hand is seen.
- Kept smoothing, brief tracking grace, roll unwrapping, and open-hand hysteresis so tracking dips still do not snap the controls to neutral.
- Removed the calibration overlay and updated README/menu copy to describe immediate hand control.

Secret test mode (July 2026):
- Added a hidden `T` key test mode and `Esc` exit. Test mode creates a dedicated `mode: "test"` state with no obstacles, no balloons, and forced debug preview.
- In test mode, the plane still flies from hand/keyboard input, but the simulation skips course scoring, obstacle recycling, collisions, and damage.
- Reused the existing MediaPipe debug canvas for the live camera feed and hand landmark overlay, enlarged while `body.test-mode` is active.
- Verification: unit tests are 59/59, production build passes, browser probe confirmed `T` enters obstacle-free test mode and `Esc` returns to menu, and the bundled web-game smoke check rendered cleanly.

Practice mode promotion (July 2026):
- Promoted the hidden test mode to visible Practice Mode on the splash screen. The start panel now has `Obstacle Course`, `Shooting Gallery`, and `Practice Mode` buttons.
- Renamed the runtime mode to `mode: "practice"` and HUD label to `PRACTICE`; `T` remains a shortcut and `Esc` exits back to the splash screen.
- Practice Mode keeps the enlarged live camera/landmark preview and obstacle-free flight behavior.

Obstacle spacing retune (July 2026):
- Raised base obstacle spacing again from 82 to 115 and limited the late-course difficulty squeeze to 5 units, so generated obstacle gaps stay at 110+ units throughout the run.
- Increased obstacle render look-ahead from 700 to 900 units so the farther-spaced course still shows multiple upcoming obstacle types.
- Verification: course spacing test failed against the old 82-unit gap, then passed after the retune; full unit suite is 59/59, production build passes with only the existing Vite chunk-size warning, and the live dev-server Playwright smoke check rendered cleanly with no captured warning/error artifacts.

Splash instructions correction (July 2026):
- Updated the splash screen copy to match the fixed-neutral hand controls: level open hand, fingertips aimed toward the camera, left/right bank, fingers up/down for pitch, fist release.
- Added mode explanations directly to the splash screen, including that Obstacle Course and Shooting Gallery support shooting and Practice Mode has no obstacles plus live camera/landmark preview.
- Added `splashInstructions.test.ts` to guard against stale calibration/ring-finger wording and verify the splash mentions the current controls/modes.

Thumb-index shooting trigger (July 2026):
- Added a hand-size-normalized thumb-tip to index-tip gap to `HandInputState` and the MediaPipe landmark math.
- `handControlSession.ts` now emits a one-frame fire pulse when the thumb quickly closes toward the index finger, with re-arm and cooldown guards so a held pinch does not continuously fire.
- Space remains a keyboard fallback; `deriveFlightCommand()` merges hand fire with keyboard fire while preserving hand steering.
- Updated splash/HUD/README copy to present the hand gesture as primary shooting and Space as fallback.
- Verification: focused hand math/session/flight/state/splash tests pass (38 tests); full `npm test` passes (64/64); `npm run build` passes with the existing Vite large-chunk warning; web-game client smoke check renders gameplay with no error artifacts; a DOM-selector Playwright probe confirms target mode keeps Space as a fallback and creates a projectile.

Shooting Gallery mode (July 2026):
- Added a splash-screen `Shooting Gallery` mode that uses balloons/projectiles while removing obstacles.
- In this mode, shooting balloons scores normally, but ramming an unshot balloon damages the hull instead of collecting it; ground hits also damage the hull.
- Fixed gallery balloon respawns lining up after the first wave: with no obstacles, the obstacle recycle seed never advanced, so every separate balloon respawn reused the same lane. Balloon recycling now has its own deterministic seed counter.

Obstacle Course balloon rules (July 2026):
- Renamed the normal start button to `Obstacle Course` and removed the optional balloon checkbox. Obstacle Course now always enables shooting and spawns sparse repair balloons alongside obstacles.
- Shooting an Obstacle Course balloon heals one hull segment without adding score. Ramming an unshot balloon damages the hull.

Space-only firing rollback (July 2026):
- Removed the thumb-index firing trigger after reliability issues in play. Hand tracking now controls steering only; `Space` is the only firing input in Obstacle Course and Shooting Gallery.
- Renamed `Practice Mode` to `Flying Practice` in visible UI and made it the first splash menu option.

Splash menu ordering/tooltips (July 2026):
- Startup menu order is now `Flying Practice`, `Shooting Gallery`, then `Obstacle Course`.
- Added brief native hover titles to all three mode buttons.

Escape quit shortcut (July 2026):
- `Esc` now quits Flying Practice, Obstacle Course, and Shooting Gallery back to the splash menu.
- Splash/HUD/README control text mentions the shortcut.

Camera lifecycle (July 2026):
- The MediaStream camera tracks now stop when the game returns to the splash menu or enters the crashed state.
- Starting any active mode requests the camera again; the tracker object stays reusable between runs.

Boost removal (July 2026):
- Removed the Shift boost mechanic entirely: keyboard state, flight commands, HUD text, splash copy, README, and serialized controls no longer expose boost.
- Plane speed now always damps back to the fixed cruise speed.

Terrain strip depth fix (July 2026):
- Fixed green ground bleed-through on the blue river and pale path strips by raising those decorative strip meshes well above the recycled terrain tiles.
- Root cause was near-coplanar depth fighting between large `CreateGround` strip overlays and the underlying terrain, most visible at low/grazing chase-camera angles after longer runs.

Crash menu/audio fix (July 2026):
- Root cause of the legacy "Restart Flight" menu after obstacle-course death: `updateHud()` mutated the original splash DOM when showing the crash overlay, changing the start button and menu paragraph instead of returning to the real splash menu.
- Added a crash-return transition policy so fatal crashes stay hidden only through the explosion delay, then reset back to `mode: "menu"` with the original splash buttons/copy.
- Engine audio now has zero gain in `menu` and `crashed` modes; active flight modes remain audible when audio has been unlocked.
- Verification included failing-first regression tests for crash return/audio gain, browser DOM repro before/after the fix, a web-game smoke run, and visual inspection of the returned splash menu screenshot.

Crash reset steering/camera fix (July 2026):
- Root cause of the post-crash hard veer: chase-camera lateral smoothing kept its pre-crash `cameraX` after the run reset, so a crash near either edge could make the newly centered plane appear offset and slow to respond for a moment.
- Added a camera-rig helper that preserves lateral camera lag only during active flight modes and snaps the camera to the reset plane position in menu/crashed states.
- Resetting/stopping the hand tracker now clears the private hand-control smoothing and open-hand grace state, not just the public input snapshot, so stale steering cannot bleed into the next run.
- Verification: focused camera/hand-control regression tests pass, full `npm test` is 83/83, production build passes, the web-game smoke run rendered cleanly, and a forced browser crash at `x=58` returned to menu and restarted at centered `x=0` with neutral controls.

Follow-ups:
- Optimize Babylon/MediaPipe bundle splitting before publishing to a bandwidth-sensitive host.
- Tune hand-feel thresholds (deadzone/expo/full-scale angles in handMath.ts) after real hand-tracking play sessions.
- Vary balloon spawns with difficulty (fewer repairs deeper in) and consider enemy targets that shoot back.
