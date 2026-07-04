# HandFly

HandFly is a browser flight game controlled by MediaPipe hand tracking. Hold an open hand in front of the camera, fingers spread and pointing at the screen, and tilt it like a joystick to fly the plane through gates, tunnels, bridges, and mountains.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Hand controls

- Hold your open hand level, fingers pointing at the screen, for a moment: the game captures that pose as neutral (auto-calibration).
- Tilt the hand clockwise/counterclockwise to bank right/left; rotate your fingers up/down to climb/dive.
- Make a fist to release the controls; open your hand again to take them back.
- Works with either hand. Press `C` to recalibrate neutral at any time.

## Keyboard

- `WASD` or arrow keys: steer (they override the hand while held).
- `Shift`: boost.
- `Space`: reserved fire action for a later shooting feature.
- `H`: toggle camera and hand-skeleton debug view (with an artificial-horizon gauge).
- `F`: toggle fullscreen. `Enter`: start/restart.

## Scoring

Threading a gate or tunnel opening scores 100; skirting around one scores 25; clearing a bridge or mountain scores 50. Obstacles get tighter and closer together the farther you fly.

## Notes

Camera access works on `localhost`; deployed versions need HTTPS for browser camera permission.

Test hooks for scripted play: `window.render_game_to_text()`, `window.advanceTime(ms)`, and `window.setRealtime(false)` to freeze the realtime loop for deterministic runs.
