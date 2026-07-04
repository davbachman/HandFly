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

Follow-ups:
- Optimize Babylon/MediaPipe bundle splitting before publishing to a bandwidth-sensitive host.
- Tune hand-feel thresholds (deadzone/expo/full-scale angles in handMath.ts) after real hand-tracking play sessions.
- Add projectiles/enemies on top of the existing `space` fire action path.
