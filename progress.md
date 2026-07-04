Original prompt: Create a new web game that uses mediapipe to let the user fly a plane with hand motions. The user should see a plane from the rear in the center of the screen, moving at constant speed. The user controls the plane by holding their hand in front of the camera, with fingers spread apart. Level hand with ring finger pointing toward the screen is the neutral position. Tilting the hand clockwise or counterclockwise (detectable from rotations of thumb and pinky in camera plane), the plane similarly tilts. Rotations of the ring finger around axis determined by thumb and pinky determine plane pitch. The challenge is to fly the plane around and through obstacles. Fly through tunnels, over mountains, under/over bridges, etc. Later I will add things you have to shoot by using the space bar. Make the game as realistic and playable as possible.

Implementation notes:
- Initialized git repository on `main`.
- Added test-first core logic for hand geometry, flight, course, collision, simulation, and text state.
- Built the Babylon.js/Vite/TypeScript browser game with a local glTF plane asset, procedural terrain, gates, tunnels, bridges, mountains, HUD, debug overlay, keyboard fallback, fullscreen, and MediaPipe Hand Landmarker setup.
- Verified unit tests, production build, production dependency audit, required web-game Playwright client, full-page desktop/mobile screenshots, crash/restart, and reserved space-bar fire state.

Follow-ups:
- Optimize Babylon/MediaPipe bundle splitting before publishing to a bandwidth-sensitive host.
- Tune obstacle generation and visual polish after real hand-tracking play sessions.
- Add projectiles/enemies on top of the existing `space` fire action path.
