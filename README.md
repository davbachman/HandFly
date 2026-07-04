# HandFly

HandFly is a browser flight game controlled by MediaPipe hand tracking. Hold an open hand in front of the camera to bank and pitch the plane, or use the keyboard fallback.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Controls

- Open hand with fingers spread: hand-tracking flight control.
- `WASD` or arrow keys: keyboard fallback.
- `H`: toggle camera and hand-skeleton debug view.
- `F`: toggle fullscreen.
- `Space`: reserved fire action for a later shooting feature.

Camera access works on `localhost`; deployed versions need HTTPS for browser camera permission.

