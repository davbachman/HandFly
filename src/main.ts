import "./styles.css";
import { createGameAudio } from "./audio";
import { shouldEscapeReturnToMenu, shouldStopCameraForMode } from "./game/modeTransitions";
import { createGameState, createObstacleCourseState, createPracticeModeState, createShootingGalleryState, renderGameStateToText } from "./game/stateText";
import { resetGameState, stepGame } from "./game/simulation";
import { createHandTracker } from "./input/handTracker";
import { createKeyboardController } from "./input/keyboard";
import { createHandFlyScene } from "./render/scene";
import type { GameState } from "./types";

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    setRealtime?: (enabled: boolean) => void;
    handFlyState?: GameState;
  }
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`HandFly DOM is missing ${selector}`);
  }
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#game-canvas");
const video = requiredElement<HTMLVideoElement>("#camera-feed");
const debugCanvas = requiredElement<HTMLCanvasElement>("#debug-canvas");
const hud = requiredElement<HTMLDivElement>("#hud");
const controlWarning = requiredElement<HTMLDivElement>("#control-warning");
const menu = requiredElement<HTMLDivElement>("#menu");
const startButton = requiredElement<HTMLButtonElement>("#start-btn");
const galleryButton = requiredElement<HTMLButtonElement>("#gallery-btn");
const practiceButton = requiredElement<HTMLButtonElement>("#practice-btn");

const state = createGameState();
const keyboard = createKeyboardController();
const tracker = createHandTracker(video, debugCanvas);
const audio = createGameAudio();
const flyScene = await createHandFlyScene(canvas);
let cameraStarted = false;
let cameraRequestId = 0;
let lastTime = performance.now();
let deterministicMode = false;
// Test hook: when false, the rAF loop stops stepping the simulation so
// advanceTime() drives it exclusively and runs are reproducible.
let realtimeEnabled = true;
let prevMode = state.mode;

// Persistent best across sessions.
interface BestRecord {
  score: number;
  distance: number;
}
const BEST_KEY = "handfly-best";

function loadBest(): BestRecord | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    return raw ? (JSON.parse(raw) as BestRecord) : null;
  } catch {
    return null;
  }
}

function saveBest(record: BestRecord): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(record));
  } catch {
    // Storage may be unavailable (private mode); best just isn't kept.
  }
}

let best = loadBest();

function recordFlight(): void {
  const distance = Math.max(0, Math.round(-state.plane.position.z));
  best = {
    score: Math.max(best?.score ?? 0, state.course.score),
    distance: Math.max(best?.distance ?? 0, distance),
  };
  saveBest(best);
}

window.handFlyState = state;
window.render_game_to_text = () => renderGameStateToText(state);

function syncInputs(nowMs: number): void {
  tracker.update(nowMs, state.debugVisible || state.mode === "practice");
  state.hand = { ...tracker.state };
  state.keyboard = { ...keyboard.state };
}

let lastControlMs = 0;

// Losing tracking mid-flight is easy to miss while watching the plane, so
// after half a second without any control source, shout about it.
function updateControlWarning(): void {
  const playableMode = state.mode === "flying" || state.mode === "shooting-gallery";
  // elapsedMs restarts from zero with each new flight; never let a stale
  // timestamp from a previous life suppress the warning.
  if (lastControlMs > state.elapsedMs) {
    lastControlMs = state.elapsedMs;
  }
  if (!playableMode || state.command.source !== "none") {
    lastControlMs = state.elapsedMs;
  }
  const controlLost = playableMode && state.elapsedMs - lastControlMs > 500;
  controlWarning.classList.toggle("hidden", !controlLost);
  if (controlLost) {
    controlWarning.textContent = tracker.status.startsWith("Camera fallback")
      ? "No camera - fly with WASD or the arrow keys"
      : "Control lost - show your open hand, fingers spread";
  }
}

function updateHud(): void {
  const trackingText =
    state.mode === "practice"
      ? "FLYING PRACTICE"
      : state.mode === "shooting-gallery"
        ? "GALLERY"
        : state.command.source === "hand"
          ? "HAND"
          : state.command.source === "keyboard"
            ? "KEYS"
            : "NEUTRAL";
  const distance = Math.max(0, Math.round(-state.plane.position.z));
  const health = Math.max(0, state.plane.health);
  const hullColor = health > 0.67 ? "#6fe08a" : health > 0.34 ? "#ffd75a" : "#ff6b5a";
  const actionHint =
    state.mode === "practice"
      ? "Esc exit · live camera preview"
      : "Space fire · Esc quit · H debug · M sound";
  hud.innerHTML = `
    <div class="hud-row">
      <span class="hud-pill">${trackingText}</span>
      <span>Score ${state.course.score}</span>
      <span>Dist ${distance}m</span>
      <span>Alt ${Math.round(state.plane.position.y)}</span>
      <span>Speed ${Math.round(state.plane.speed)}</span>
      <span>Hull <span class="hud-meter"><i style="width:${Math.round(health * 100)}%;background:${hullColor}"></i></span></span>
    </div>
    <div class="hud-row subtle">
      <span>${tracker.status}</span>
      <span>${state.mode === "practice" ? actionHint : state.debugVisible ? "H hide debug" : actionHint}</span>
    </div>
  `;
  updateControlWarning();
  document.body.classList.toggle("debug-visible", state.debugVisible || state.mode === "practice");
  document.body.classList.toggle("practice-mode", state.mode === "practice");
  // Hold the crash overlay back long enough to watch the explosion.
  const showCrashUi = state.mode === "crashed" && state.elapsedMs - state.lastHitMs >= 1100;
  document.body.classList.toggle("crashed", showCrashUi);
  menu.classList.toggle(
    "hidden",
    state.mode === "flying" ||
      state.mode === "practice" ||
      state.mode === "shooting-gallery" ||
      (state.mode === "crashed" && !showCrashUi),
  );
  if (showCrashUi) {
    startButton.textContent = "Restart Flight";
    const panelText = menu.querySelector("p");
    const bestText = best ? ` Best so far: ${best.score} pts, ${best.distance}m.` : "";
    if (panelText) panelText.textContent = `${state.crashReason ?? "You clipped the course."} Score ${state.course.score}, distance ${Math.max(0, Math.round(-state.plane.position.z))}m.${bestText} Press Enter or the button to fly again.`;
  }
}

function updateFrame(dt: number, nowMs: number): void {
  syncInputs(nowMs);
  stepGame(state, dt);
  if (state.mode === "crashed" && prevMode === "flying") {
    recordFlight();
  }
  stopCameraIfGameStopped();
  prevMode = state.mode;
  flyScene.update(state, dt);
  audio.update(state);
  state.events.length = 0;
  flyScene.render();
  updateHud();
}

window.advanceTime = (ms: number): void => {
  deterministicMode = true;
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i += 1) {
    updateFrame(1 / 60, performance.now() + i * (1000 / 60));
  }
};

window.setRealtime = (enabled: boolean): void => {
  realtimeEnabled = enabled;
};

function animate(nowMs: number): void {
  if (realtimeEnabled && !deterministicMode) {
    const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastTime) / 1000));
    updateFrame(dt, nowMs);
  }
  deterministicMode = false;
  lastTime = nowMs;
  requestAnimationFrame(animate);
}

async function startFlight(): Promise<void> {
  if (state.mode !== "flying") {
    resetGameState(state, createObstacleCourseState());
  }
  state.mode = "flying";
  state.crashReason = null;
  menu.classList.add("hidden");
  audio.unlock();
  await startCameraOnce();
}

async function startCameraOnce(): Promise<void> {
  if (cameraStarted) return;
  cameraStarted = true;
  const requestId = (cameraRequestId += 1);
  await tracker.initialize();
  if (requestId !== cameraRequestId || shouldStopCameraForMode(state.mode)) {
    tracker.stopCamera();
    cameraStarted = false;
  }
}

function stopCameraIfGameStopped(): void {
  if (!cameraStarted || !shouldStopCameraForMode(state.mode)) return;
  cameraRequestId += 1;
  tracker.stopCamera();
  cameraStarted = false;
}

async function enterShootingGallery(): Promise<void> {
  resetGameState(state, createShootingGalleryState());
  state.mode = "shooting-gallery";
  state.crashReason = null;
  menu.classList.add("hidden");
  audio.unlock();
  await startCameraOnce();
}

async function enterPracticeMode(): Promise<void> {
  resetGameState(state, createPracticeModeState());
  state.mode = "practice";
  state.crashReason = null;
  menu.classList.add("hidden");
  await startCameraOnce();
}

function exitToMenu(): void {
  resetGameState(state, createGameState());
  state.mode = "menu";
  state.debugVisible = false;
  state.crashReason = null;
  prevMode = state.mode;
  stopCameraIfGameStopped();
  menu.classList.remove("hidden");
  updateHud();
}

startButton.addEventListener("click", () => {
  void startFlight();
});

practiceButton.addEventListener("click", () => {
  void enterPracticeMode();
});

galleryButton.addEventListener("click", () => {
  void enterShootingGallery();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && shouldEscapeReturnToMenu(state.mode)) {
    event.preventDefault();
    exitToMenu();
    return;
  }
  if (event.code === "KeyT") {
    event.preventDefault();
    void enterPracticeMode();
    return;
  }
  if (event.code === "KeyH") {
    state.debugVisible = !state.debugVisible;
  }
  if (event.code === "KeyM") {
    audio.toggleMuted();
  }
  if (event.code === "KeyF") {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }
  if (event.code === "Enter" && state.mode !== "flying") {
    void startFlight();
  }
});

window.addEventListener("resize", () => flyScene.resize());
window.addEventListener("beforeunload", () => {
  keyboard.dispose();
  cameraStarted = false;
  tracker.dispose();
  flyScene.dispose();
});

flyScene.update(state, 1 / 60);
flyScene.render();
updateHud();
requestAnimationFrame(animate);
