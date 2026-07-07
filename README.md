# HandFly

HandFly is a browser flight game controlled by MediaPipe hand tracking. Hold an open hand in front of the camera, fingers spread and pointing at the screen, and tilt it like a joystick to fly the plane through gates, tunnels, bridges, and mountains.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

The splash screen offers three starts: `Flying Practice` for obstacle-free flight with a large live camera/hand-landmark preview, `Obstacle Course`, and `Shooting Gallery`.

## Hand controls

- Show an open hand with fingers spread and pointing at the screen; steering starts as soon as the hand is tracked.
- Tilt the hand clockwise/counterclockwise to bank right/left; rotate your fingers up/down to climb/dive.
- Make a fist to release the controls; open your hand again to take them back.
- Works with either hand.

## Keyboard

- `WASD` or arrow keys: steer (they override the hand while held).
- `Space`: tracer fire in Obstacle Course and Shooting Gallery.
- `Esc`: quit Flying Practice, Obstacle Course, or Shooting Gallery back to the splash menu.
- `H`: toggle camera and hand-skeleton debug view (with an artificial-horizon gauge).
- `F`: toggle fullscreen. `Enter`: start/restart.

## Scoring and damage

Threading a gate or tunnel opening scores 100; skirting around one scores 25; clearing a bridge or mountain scores 50. Obstacles get tighter and closer together the farther you fly.

Obstacle Course includes occasional repair balloons. Shooting one restores one hull segment without adding score; ramming an unshot balloon damages the hull.

Shooting Gallery removes obstacles and keeps score balloons active. Shoot balloons for points; hitting an unshot balloon damages the hull.

You start with a clear warm-up stretch to get your hand in position. The hull absorbs two collisions (with a short grace window after each hit); the third ends the flight in an explosion. Scraping the ground counts as a hit and bounces you back up.

All sound is synthesized live with the Web Audio API (engine drone, shots, pops, hits, chimes) - no audio assets. `M` toggles it.

## Notes

Camera access works on `localhost`; deployed versions need HTTPS for browser camera permission.
The camera stream is released when you return to the splash menu or crash out of a run, and requested again when you start a mode.

Test hooks for scripted play: `window.render_game_to_text()`, `window.advanceTime(ms)`, and `window.setRealtime(false)` to freeze the realtime loop for deterministic runs.
